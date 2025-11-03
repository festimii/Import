import { useEffect, useState } from "react";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import {
  Alert,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  enablePushNotifications,
  isPushSupported,
} from "../notifications";

const NotificationPermissionBanner = ({ onEnabled }) => {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [enabling, setEnabling] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const supportedValue = isPushSupported();
    setSupported(supportedValue);
    if (supportedValue && typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
  }, []);

  const handleEnable = async () => {
    setStatus(null);
    setEnabling(true);

    try {
      await enablePushNotifications();
      setPermission("granted");
      setStatus({
        severity: "success",
        message:
          "Desktop notifications are now enabled. We'll keep this workspace up to date automatically.",
      });
      onEnabled?.();
    } catch (error) {
      const nextPermission =
        typeof Notification !== "undefined" ? Notification.permission : "default";
      setPermission(nextPermission);
      setStatus({
        severity: "error",
        message: error?.message || "We couldn't enable notifications. Please try again.",
      });
    } finally {
      setEnabling(false);
    }
  };

  if (!supported || permission === "granted") {
    return null;
  }

  const isBlocked = permission === "denied";

  return (
    <Stack spacing={1}>
      <Alert
        severity={isBlocked ? "warning" : "info"}
        icon={<NotificationsActiveRoundedIcon fontSize="inherit" />}
        action={
          !isBlocked && (
            <Button
              color="inherit"
              size="small"
              onClick={handleEnable}
              disabled={enabling}
            >
              {enabling && (
                <CircularProgress
                  color="inherit"
                  size={16}
                  sx={{ mr: 1 }}
                />
              )}
              {enabling ? "Enabling…" : "Enable"}
            </Button>
          )
        }
      >
        <Stack spacing={0.5}>
          <Typography variant="body2">
            {isBlocked
              ? "Desktop notifications are blocked for this site. Update your browser settings to allow them and then reload this page."
              : "Enable desktop notifications to receive updates even when this window is not in focus."}
          </Typography>
          {!isBlocked && (
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              We'll register a secure service worker and subscribe this browser using your confirmation.
            </Typography>
          )}
        </Stack>
      </Alert>
      {status && (
        <Alert severity={status.severity}>
          {status.message}
        </Alert>
      )}
    </Stack>
  );
};

export default NotificationPermissionBanner;
