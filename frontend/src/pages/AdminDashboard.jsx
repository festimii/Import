import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Container,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import API from "../api";
import UserManagementDialog from "../components/UserManagementDialog";
import CalendarOverview from "../components/CalendarOverview";
import WorkspaceHeader from "../components/WorkspaceHeader";

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userFeedback, setUserFeedback] = useState(null);
  const [updatingUser, setUpdatingUser] = useState(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);

  const loadUsers = async () => {
    setUsersLoading(true);
    setUserFeedback(null);
    try {
      const res = await API.get("/auth/users");
      setUsers(res.data);
    } catch (error) {
      setUserFeedback({
        severity: "error",
        message: "Unable to load the user directory right now.",
      });
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (isUserDialogOpen) {
      loadUsers();
    }
  }, [isUserDialogOpen]);

  const handleRoleChange = async (username, newRole) => {
    const currentUser = users.find((user) => user.Username === username);
    if (!currentUser || currentUser.Role === newRole) {
      return;
    }

    setUserFeedback(null);
    setUpdatingUser(username);
    setUsers((prev) =>
      prev.map((user) =>
        user.Username === username ? { ...user, Role: newRole } : user
      )
    );

    try {
      await API.patch(`/auth/users/${encodeURIComponent(username)}`, {
        role: newRole,
      });
      setUserFeedback({
        severity: "success",
        message: `Updated ${username}'s role to ${newRole}.`,
      });
    } catch (error) {
      setUsers((prev) =>
        prev.map((user) =>
          user.Username === username ? { ...user, Role: currentUser.Role } : user
        )
      );
      setUserFeedback({
        severity: "error",
        message: "We couldn't update that role. Please try again.",
      });
    } finally {
      setUpdatingUser(null);
    }
  };

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleOpenUserDialog = () => {
    setUserFeedback(null);
    setIsUserDialogOpen(true);
  };

  const handleCloseUserDialog = () => {
    setIsUserDialogOpen(false);
    setUserFeedback(null);
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", gap: 4, py: { xs: 3, md: 4 } }}>
      <WorkspaceHeader
        title="Admin workspace"
        subtitle="Oversee team roles, approved imports and the shared arrival roadmap."
        onLogout={logout}
        showManageUsers
        onManageUsers={handleOpenUserDialog}
      />

      <Container sx={{ flexGrow: 1 }} maxWidth="lg">
        <Stack spacing={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 4,
                  background: "linear-gradient(140deg, rgba(27,75,145,0.08), rgba(46,184,138,0.12))",
                  border: (theme) => `1px solid ${theme.palette.primary.main}1f`,
                }}
              >
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Workspace insights
                  </Typography>
                  <Typography variant="body1">
                    Manage permissions and stay informed about confirmed arrivals without leaving the dashboard.
                  </Typography>
                </Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 4 }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Team management
                  </Typography>
                  <Typography variant="body1">
                    Open the management panel to adjust user roles and onboarding access instantly.
                  </Typography>
                  <Box>
                    <Button variant="contained" onClick={handleOpenUserDialog}>
                      Open user management
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <CalendarOverview description="Review confirmed import requests and prepare for upcoming arrivals." />
        </Stack>
      </Container>
      <UserManagementDialog
        open={isUserDialogOpen}
        onClose={handleCloseUserDialog}
        users={users}
        loading={usersLoading}
        feedback={userFeedback}
        onReload={loadUsers}
        onRoleChange={handleRoleChange}
        updatingUser={updatingUser}
      />
    </Box>
  );
}
