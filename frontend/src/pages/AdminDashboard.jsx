import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Container,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import API from "../api";
import UserManagementDialog from "../components/UserManagementDialog";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";

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
    loadUsers();
  }, []);

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

  const { totalUsers, confirmerCount, requesterCount } = useMemo(() => {
    const total = users.length;
    const counts = users.reduce(
      (acc, user) => {
        if (user.Role === "confirmer") acc.confirmer += 1;
        if (user.Role === "requester") acc.requester += 1;
        return acc;
      },
      { confirmer: 0, requester: 0 }
    );

    return {
      totalUsers: total,
      confirmerCount: counts.confirmer,
      requesterCount: counts.requester,
    };
  }, [users]);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHero
        title="Admin workspace"
        subtitle="Track approved import requests, anticipate arrivals and curate role-based access for every collaborator."
        actions={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button variant="outlined" color="inherit" onClick={handleOpenUserDialog}>
              Manage users
            </Button>
            <Button variant="contained" color="secondary" onClick={logout}>
              Logout
            </Button>
          </Stack>
        }
      >
        <Stack spacing={1.5} sx={{ color: "inherit" }}>
          <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>
            Governance snapshot
          </Typography>
          <Typography variant="body1">
            Keep access aligned with responsibilities and consult the shared arrival
            calendar to inform stakeholders.
          </Typography>
        </Stack>
      </PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<GroupsRoundedIcon />}
                label="Active users"
                value={usersLoading ? "…" : totalUsers}
                trend="Invite colleagues to streamline handoffs"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<VerifiedUserRoundedIcon />}
                label="Confirmers"
                value={usersLoading ? "…" : confirmerCount}
                trend="Ensure every lane has an approval owner"
                color="secondary"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<EventBusyRoundedIcon />}
                label="Requesters"
                value={usersLoading ? "…" : requesterCount}
                trend="Balance intake across teams"
                color="info"
              />
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
