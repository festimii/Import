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
} from "@mui/material";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import AuthLayout from "../components/AuthLayout";
import API from "../api";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRegister = async (event) => {
    event.preventDefault();

    if (password !== confirm) {
      setFeedback({
        severity: "error",
        message: "Passwords do not match. Please try again.",
      });
      return;
    }

    try {
      await API.post("/auth/register", { username, password });
      setFeedback({
        severity: "success",
        message: "Account created! Redirecting you to sign in...",
      });
      setTimeout(() => (window.location.href = "/"), 1500);
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "Registration failed. That username may already be taken.",
      });
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up secure access so you can request imports and collaborate with your confirmation team."
      accent="Team onboarding"
      footer={
        <Stack spacing={1} textAlign="center">
          <Link component={RouterLink} to="/help" underline="hover">
            How the app works (Help)
          </Link>
          <Link component={RouterLink} to="/" underline="hover">
            Already have an account? Sign in
          </Link>
        </Stack>
      }
    >
      <Box component="form" onSubmit={handleRegister} noValidate>
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
          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            helperText="Use at least 8 characters with numbers or symbols"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((prev) => !prev)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Confirm password"
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
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
                    {showConfirm ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button type="submit" variant="contained" size="large">
            Register
          </Button>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
