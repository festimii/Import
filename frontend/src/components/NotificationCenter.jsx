import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import API from "../api";

const resolveSeverity = (type) => {
  if (type === "error") return "error";
  if (type === "warning") return "warning";
  if (type === "success") return "success";
  return "info";
};

const formatTimestamp = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const NotificationCenter = forwardRef(
  (
    {
      title = "Notifications",
      description = "Stay aligned with approvals, rejections and scheduling updates.",
      emptyMessage = "You're all caught up with the latest updates.",
      loadingMessage = "Checking for updates…",
      onUnreadCountChange,
      onLoadingChange,
      sx,
    },
    ref
  ) => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState(null);

    const loadNotifications = useCallback(async () => {
      setLoading(true);
      setFeedback(null);

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
      } catch (error) {
        setFeedback({
          severity: "error",
          message: "We couldn't load your notifications. Please try again.",
        });
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    }, []);

    const handleDismiss = useCallback(async (id) => {
      setFeedback(null);
      try {
        await API.patch(`/notifications/${id}/read`);
        setNotifications((prev) =>
          prev.filter((notification) => notification.ID !== id)
        );
      } catch (error) {
        setFeedback({
          severity: "error",
          message: "We couldn't update that notification. Please try again.",
        });
      }
    }, []);

    useImperativeHandle(ref, () => ({ reload: loadNotifications }), [
      loadNotifications,
    ]);

    useEffect(() => {
      loadNotifications();
    }, [loadNotifications]);

    useEffect(() => {
      onLoadingChange?.(loading);
    }, [loading, onLoadingChange]);

    const unreadCount = notifications.length;

    useEffect(() => {
      onUnreadCountChange?.(unreadCount);
    }, [onUnreadCountChange, unreadCount]);

    const content = useMemo(() => {
      if (loading) {
        return (
          <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
            <CircularProgress color="primary" size={24} />
            <Typography variant="body2" color="text.secondary">
              {loadingMessage}
            </Typography>
          </Stack>
        );
      }

      if (notifications.length === 0) {
        return <Alert severity="success">{emptyMessage}</Alert>;
      }

      return (
        <Stack spacing={2}>
          {notifications.map((notification) => {
            const timestamp = formatTimestamp(notification.CreatedAt);
            return (
              <Alert
                key={notification.ID}
                severity={resolveSeverity(notification.Type)}
                onClose={() => handleDismiss(notification.ID)}
              >
                <Stack spacing={0.5}>
                  <Typography variant="body2">
                    {notification.Message}
                  </Typography>
                  {timestamp && (
                    <Typography variant="caption" color="text.secondary">
                      {timestamp}
                    </Typography>
                  )}
                </Stack>
              </Alert>
            );
          })}
        </Stack>
      );
    }, [
      emptyMessage,
      handleDismiss,
      loading,
      loadingMessage,
      notifications,
    ]);

    return (
      <Paper
        elevation={8}
        sx={{
          p: { xs: 3, md: 4 },
          borderRadius: 4,
          background: (theme) =>
            `linear-gradient(160deg, ${theme.palette.common.white} 0%, ${theme.palette.grey[50]} 100%)`,
          ...sx,
        }}
      >
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h6">{title}</Typography>
              {description && (
                <Typography variant="body2" color="text.secondary">
                  {description}
                </Typography>
              )}
            </Box>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<RefreshRoundedIcon />}
              onClick={loadNotifications}
              disabled={loading}
              sx={{ borderRadius: 999 }}
            >
              Refresh
            </Button>
          </Stack>

          {feedback && (
            <Alert severity={feedback.severity}>{feedback.message}</Alert>
          )}

          {content}
        </Stack>
      </Paper>
    );
  }
);

NotificationCenter.displayName = "NotificationCenter";

export default NotificationCenter;
