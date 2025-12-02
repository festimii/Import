import { useState } from "react";
import { Link as RouterLink, Navigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
} from "@mui/material";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import AuthLayout from "../components/AuthLayout";
import API from "../api";

export default function ChangePassword() {
  const token = localStorage.getItem("token");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);

    if (newPassword !== confirmPassword) {
      setFeedback({
        severity: "error",
        message: "New passwords do not match.",
      });
      return;
    }

    setSubmitting(true);
    try {
      await API.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setFeedback({
        severity: "success",
        message: "Password updated. Please sign in again with your new password.",
      });
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (error) {
      const message =
        error?.response?.data?.message ??
        "We couldn't update your password. Double-check your current password and try again.";
      setFeedback({ severity: "error", message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Update your password"
      subtitle="Keep your account secure by choosing a fresh password."
      accent="Security"
      footer={
        <Stack spacing={1} textAlign="center">
          <Link component={RouterLink} to="/" underline="hover">
            Return to dashboard
          </Link>
          <Link component={RouterLink} to="/help" underline="hover">
            Need help?
          </Link>
        </Stack>
      }
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={3}>
          {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

          <TextField
            label="Current password"
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showCurrent ? "Hide password" : "Show password"}
                    onClick={() => setShowCurrent((prev) => !prev)}
                    edge="end"
                  >
                    {showCurrent ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="New password"
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            helperText="Use at least 8 characters with numbers or symbols"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showNew ? "Hide password" : "Show password"}
                    onClick={() => setShowNew((prev) => !prev)}
                    edge="end"
                  >
                    {showNew ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Confirm new password"
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    onClick={() => setShowConfirm((prev) => !prev)}
                    edge="end"
                  >
                    {showConfirm ? (
                      <VisibilityOffRoundedIcon />
                    ) : (
                      <VisibilityRoundedIcon />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
          >
            Update password
          </Button>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
