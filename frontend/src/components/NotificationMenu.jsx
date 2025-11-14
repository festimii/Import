import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationPermissionBanner from "./NotificationPermissionBanner";
import API from "../api";
import {
  enablePushNotifications,
  isPushSupported,
} from "../notifications";

const resolveTypeLabel = (type) => {
  if (!type) return "Update";
  switch (type) {
    case "error":
      return "Alert";
    case "warning":
      return "Warning";
    case "success":
      return "Success";
    default:
      return "Update";
  }
};

const resolveTypeColor = (type) => {
  switch (type) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "success":
      return "success";
    default:
      return "info";
  }
};

const formatTimestamp = (value) => {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Just now";
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const MAX_BADGE_COUNT = 99;
const SYNC_INTERVAL_MS = 60_000;

const NotificationMenu = ({ onUnreadChange, onLoadingChange } = {}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [permission, setPermission] = useState(
    typeof window !== "undefined" && typeof Notification !== "undefined"
      ? Notification.permission
      : "default"
  );
  const seenNotificationsRef = useRef(new Set());
  const syncTimerRef = useRef(null);

  const unreadCount = notifications.length;
  const menuOpen = Boolean(anchorEl);

  const ensureSeen = useCallback((id) => {
    if (!id) return;
    const next = new Set(seenNotificationsRef.current);
    next.add(id);
    seenNotificationsRef.current = next;
  }, []);

  const triggerNativeToasts = useCallback(
    (nextNotifications) => {
      if (
        typeof window === "undefined" ||
        typeof Notification === "undefined" ||
        !isPushSupported()
      ) {
        return;
      }

      if (Notification.permission !== "granted") {
        return;
      }

      if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
        return;
      }

      nextNotifications.forEach((notification) => {
        if (!notification?.ID || seenNotificationsRef.current.has(notification.ID)) {
          return;
        }

        ensureSeen(notification.ID);

        try {
          const toast = new Notification(resolveTypeLabel(notification.Type), {
            body: notification.Message,
            tag: `import-tracker-${notification.ID}`,
            data: {
              requestId: notification.RequestID,
            },
          });

          toast.onclick = () => {
            window.focus();
          };
        } catch (nativeError) {
          console.debug("Native notification error:", nativeError);
        }
      });
    },
    [ensureSeen]
  );

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await API.get("/notifications");
      const unread = Array.isArray(res.data)
        ? res.data.filter((notification) => !notification.ReadAt)
        : [];

      unread.sort((a, b) => {
        const dateA = a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0;
        const dateB = b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0;
        return dateB - dateA;
      });

      setNotifications(unread);
      triggerNativeToasts(unread);
    } catch (requestError) {
      console.error("Notification fetch error:", requestError);
      setError("We couldn't load your notifications. Please try again.");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [triggerNativeToasts]);

  const closeMenu = () => setAnchorEl(null);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
    fetchNotifications();
  };

  const handleNotificationClick = async (notification) => {
    const target = notification;
    ensureSeen(target.ID);

    try {
      await API.patch(`/notifications/${target.ID}/read`);
      setNotifications((prev) =>
        prev.filter((existing) => existing.ID !== target.ID)
      );

    } catch (requestError) {
      console.error("Notification update error:", requestError);
      setError("We couldn't update that notification. Please try again.");
    }
  };

  const handleMarkAllRead = async () => {
    if (notifications.length === 0) return;
    setMarkingAll(true);
    setError(null);

    try {
      await Promise.all(
        notifications.map((notification) =>
          API.patch(`/notifications/${notification.ID}/read`).catch((err) => {
            console.error("Bulk notification update error:", err);
          })
        )
      );
      notifications.forEach((notification) => ensureSeen(notification.ID));
      setNotifications([]);
    } finally {
      setMarkingAll(false);
    }
  };

  const handlePushEnabled = useCallback(() => {
    fetchNotifications();
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
    syncTimerRef.current = setInterval(fetchNotifications, SYNC_INTERVAL_MS);
    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchNotifications();
      }
      if (typeof Notification !== "undefined") {
        setPermission(Notification.permission);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!isPushSupported()) {
      return;
    }

    if (permission === "granted") {
      enablePushNotifications().catch((err) => {
        console.error("Push enable error:", err);
      });
    }
  }, [permission]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [onUnreadChange, unreadCount]);

  const shouldShowPermissionBanner =
    permission !== "granted" && isPushSupported();

  const menuContent = useMemo(() => {
    if (loading) {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary">
            Checking for updates...
          </Typography>
        </Stack>
      );
    }

    if (notifications.length === 0) {
      return (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
          <NotificationsNoneRoundedIcon color="disabled" fontSize="large" />
          <Typography variant="body2" color="text.secondary">
            You're up to date with the latest changes.
          </Typography>
        </Stack>
      );
    }

    return (
      <List sx={{ py: 0 }}>
        {notifications.map((notification) => {
          const timestamp = formatTimestamp(notification.CreatedAt);
          return (
            <ListItemButton
              key={notification.ID}
              alignItems="flex-start"
              onClick={() => handleNotificationClick(notification)}
              sx={{
                alignItems: "flex-start",
                "&:hover": {
                  backgroundColor: (theme) => theme.palette.action.hover,
                },
              }}
            >
              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {notification.Message}
                  </Typography>
                }
                secondary={
                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mt: 0.5 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {timestamp}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: (theme) =>
                          theme.palette[resolveTypeColor(notification.Type)]?.main ??
                          theme.palette.info.main,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.2,
                      }}
                    >
                      {resolveTypeLabel(notification.Type)}
                    </Typography>
                  </Stack>
                }
              />
            </ListItemButton>
          );
        })}
      </List>
    );
  }, [loading, notifications]);

  return (
    <>
      <Tooltip title="Notifications">
        <span>
          <IconButton
            color={unreadCount > 0 ? "primary" : "default"}
            onClick={handleMenuOpen}
            aria-label="Open notifications"
          >
            <Badge
              color="error"
              overlap="circular"
              badgeContent={
                unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unreadCount
              }
              invisible={unreadCount === 0}
            >
              {unreadCount > 0 ? (
                <NotificationsActiveRoundedIcon />
              ) : (
                <NotificationsNoneRoundedIcon />
              )}
            </Badge>
          </IconButton>
        </span>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={closeMenu}
        keepMounted
        PaperProps={{
          sx: {
            width: 380,
            maxWidth: "90vw",
            borderRadius: 3,
            overflow: "hidden",
          },
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">Notifications</Typography>
            <Typography variant="caption" color="text.secondary">
              Live updates arrive directly on Windows when enabled.
            </Typography>
          </Stack>
          <Tooltip title="Refresh">
            <span>
              <IconButton
                size="small"
                onClick={fetchNotifications}
                disabled={loading}
              >
                <RefreshRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {shouldShowPermissionBanner && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
              <NotificationPermissionBanner onEnabled={handlePushEnabled} />
            </Box>
          </>
        )}

        {error && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {error}
              </Alert>
            </Box>
          </>
        )}

        <Divider />
        <Box
          sx={{
            maxHeight: 360,
            overflowY: "auto",
            px: 0,
          }}
        >
          {menuContent}
        </Box>
        <Divider />
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ px: 2, py: 1 }}
        >
          <Button
            size="small"
            startIcon={<DoneAllRoundedIcon fontSize="small" />}
            onClick={handleMarkAllRead}
            disabled={notifications.length === 0 || markingAll}
          >
            Mark all read
          </Button>
          <Button size="small" variant="text" onClick={closeMenu}>
            Close
          </Button>
        </Stack>
      </Menu>
    </>
  );
};

export default NotificationMenu;
