import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import AuthLayout from "../components/AuthLayout";
import API from "../api";

export default function ForgotPassword() {
  const [username, setUsername] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [step, setStep] = useState("request");
  const [submitting, setSubmitting] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRequestCode = async (event) => {
    event.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    try {
      const res = await API.post("/auth/forgot-password", { username });
      setGeneratedCode(res.data.resetCode ?? "");
      setStep("reset");
      setFeedback({
        severity: "success",
        message:
          "Reset code generated. Enter it below with your new password to finish.",
      });
    } catch (error) {
      const message =
        error?.response?.data?.message ??
        "We couldn't generate a reset code. Double-check the username.";
      setFeedback({ severity: "error", message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (event) => {
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
      await API.post("/auth/reset-password", {
        username,
        code: resetCode,
        newPassword,
      });
      setFeedback({
        severity: "success",
        message: "Password reset! Redirecting you to sign in with your new password.",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (error) {
      const message =
        error?.response?.data?.message ??
        "We couldn't reset your password. Please confirm the code and try again.";
      setFeedback({ severity: "error", message });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = (
    <Box component="form" onSubmit={handleResetPassword} noValidate>
      <Stack spacing={3}>
        {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}
        <Stack spacing={1}>
          <TextField
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            fullWidth
            InputProps={{ readOnly: true }}
          />
          {generatedCode && (
            <Typography variant="caption" color="text.secondary">
              Reset code for testing: <strong>{generatedCode}</strong>
            </Typography>
          )}
        </Stack>
        <TextField
          label="Reset code"
          value={resetCode}
          onChange={(event) => setResetCode(event.target.value)}
          required
          fullWidth
          autoComplete="one-time-code"
        />
        <TextField
          label="New password"
          type={showNew ? "text" : "password"}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          required
          fullWidth
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
          helperText="Use at least 8 characters with numbers or symbols"
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

        <Stack direction="row" spacing={2}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            fullWidth
          >
            Reset password
          </Button>
          <Button
            variant="text"
            color="secondary"
            onClick={() => {
              setStep("request");
              setResetCode("");
              setGeneratedCode("");
              setNewPassword("");
              setConfirmPassword("");
              setFeedback(null);
              setSubmitting(false);
            }}
            fullWidth
          >
            Request a new code
          </Button>
        </Stack>
      </Stack>
    </Box>
  );

  const requestForm = (
    <Box component="form" onSubmit={handleRequestCode} noValidate>
      <Stack spacing={3}>
        {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

        <TextField
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
          fullWidth
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={!username || submitting}
        >
          Send reset code
        </Button>
      </Stack>
    </Box>
  );

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll help you set a new password so you can get back to managing imports."
      accent="Account recovery"
      footer={
        <Stack spacing={1} textAlign="center">
          <Link component={RouterLink} to="/" underline="hover">
            Back to sign in
          </Link>
          <Link component={RouterLink} to="/help" underline="hover">
            Need more help?
          </Link>
        </Stack>
      }
    >
      {step === "request" ? requestForm : resetForm}
    </AuthLayout>
  );
}
