import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
  MenuItem,
} from "@mui/material";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { useNavigate } from "react-router-dom";
import API from "../api";
import SectionCard from "../components/SectionCard";
import PageHero from "../components/PageHero";

const formatDate = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString();
  }
  return value;
};

const groupByBatch = (items = []) => {
  const groups = new Map();

  items.forEach((item, index) => {
    if (!item) return;
    const key = item.BatchId || `legacy-${item.ID || index}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        batchId: item.BatchId || null,
        importer: item.Importer || "Unknown importer",
        requester: item.Requester || "Unknown",
        requestDate: item.RequestDate || null,
        plannedArrivalDate: item.PlannedArrivalDate || item.ArrivalDate || null,
        actualArrivalDate: item.ActualArrivalDate || null,
        statuses: new Set(),
        items: [],
      });
    }
    const group = groups.get(key);
    group.items.push(item);
    if (item.Importer) group.importer = item.Importer;
    if (item.Requester) group.requester = item.Requester;
    if (item.RequestDate) group.requestDate = item.RequestDate;
    if (item.PlannedArrivalDate || item.ArrivalDate) {
      group.plannedArrivalDate = item.PlannedArrivalDate || item.ArrivalDate;
    }
    if (item.ActualArrivalDate) {
      group.actualArrivalDate = item.ActualArrivalDate;
    }
    const normalizedStatus = String(item.Status || "pending").toLowerCase();
    group.statuses.add(normalizedStatus);
  });

  return Array.from(groups.values()).sort((a, b) => {
    const aTime = a.requestDate ? new Date(a.requestDate).getTime() : 0;
    const bTime = b.requestDate ? new Date(b.requestDate).getTime() : 0;
    return bTime - aTime;
  });
};

export default function RequesterHistory() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [filterImporter, setFilterImporter] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [activeBatchId, setActiveBatchId] = useState(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await API.get("/imports/mine");
      const data = Array.isArray(response.data) ? response.data : [];
      setRecords(data);
    } catch (error) {
      setFeedback({
        severity: "error",
        message:
          error?.response?.data?.message ||
          "Nuk mund te ngarkojme porosite tuaja. Provoni perseri.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const grouped = useMemo(() => groupByBatch(records), [records]);

  const filteredGroups = useMemo(() => {
    const importerQuery = filterImporter.trim().toLowerCase();
    const fromTs = filterFrom ? new Date(filterFrom).getTime() : null;
    const toTs = filterTo ? new Date(filterTo).getTime() : null;

    return grouped.filter((group) => {
      const matchesImporter = importerQuery
        ? group.importer.toLowerCase().includes(importerQuery) ||
          group.requester.toLowerCase().includes(importerQuery)
        : true;
      const groupDate = group.requestDate
        ? new Date(group.requestDate).getTime()
        : null;
      const matchesFrom = fromTs ? (groupDate || 0) >= fromTs : true;
      const matchesTo = toTs ? (groupDate || 0) <= toTs : true;
      const matchesStatus =
        filterStatus === "all" || group.statuses.has(filterStatus);
      return matchesImporter && matchesFrom && matchesTo && matchesStatus;
    });
  }, [filterFrom, filterImporter, filterStatus, filterTo, grouped]);

  const handleExportCsv = () => {
    if (filteredGroups.length === 0) return;
    const rows = [
      [
        "BatchId",
        "Importer",
        "Requester",
        "Request Date",
        "Planned Arrival",
        "Actual Arrival",
        "Articles",
        "Statuses",
      ],
    ];
    filteredGroups.forEach((group) => {
      rows.push([
        group.batchId || "",
        group.importer,
        group.requester,
        group.requestDate || "",
        group.plannedArrivalDate || "",
        group.actualArrivalDate || "",
        group.items.length,
        Array.from(group.statuses).join(" | "),
      ]);
    });
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "import-history.csv";
    link.click();
  };

  const handleOpenHistory = async (group) => {
    if (!group?.batchId) return;
    setActiveBatchId(group.batchId);
    setHistoryOpen(true);
    setHistoryError(null);
    setHistoryLogs([]);
    setHistoryLoading(true);
    try {
      const response = await API.get(`/imports/batch/${group.batchId}/logs`);
      setHistoryLogs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setHistoryError(
        error?.response?.data?.message ||
          "Nuk mund te ngarkojme historikun per kete porosi. Ju lutemi provoni perseri."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCloseHistory = () => {
    if (historyLoading) return;
    setHistoryOpen(false);
    setHistoryLogs([]);
    setHistoryError(null);
    setActiveBatchId(null);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PageHero
        title="Historiku i Porosive"
        subtitle="Filtroni dhe eksportoni porosite e derguara dhe konfirmimet"
        actions={[
          <Button
            key="dashboard"
            variant="outlined"
            startIcon={<HomeRoundedIcon />}
            onClick={() => navigate("/")}
          >
            Dashboard
          </Button>,
          <Button
            key="history"
            variant="contained"
            startIcon={<HistoryRoundedIcon />}
            onClick={loadRecords}
            disabled={loading}
          >
            {loading ? "Duke ngarkuar..." : "Rifresko"}
          </Button>,
        ]}
      />

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={3}>
          {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 3, display: "flex", gap: 1.5, flexWrap: "wrap" }}
          >
            <TextField
              label="Filtro sipas importuesit/kerkuesit"
              size="small"
              value={filterImporter}
              onChange={(e) => setFilterImporter(e.target.value)}
              sx={{ minWidth: 240 }}
            />
            <TextField
              label="Nga data"
              type="date"
              size="small"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Deri me"
              type="date"
              size="small"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Statusi"
              select
              size="small"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="all">Te gjithe</MenuItem>
              <MenuItem value="pending">Ne pritje</MenuItem>
              <MenuItem value="approved">Te miratuar</MenuItem>
              <MenuItem value="rejected">Te refuzuar</MenuItem>
              <MenuItem value="completed">Te perfunduar</MenuItem>
              <MenuItem value="cancelled">Anuluar</MenuItem>
              <MenuItem value="archived">Arkivuar</MenuItem>
            </TextField>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={handleExportCsv}
                disabled={filteredGroups.length === 0}
              >
                Eksporto CSV
              </Button>
            </Stack>
          </Paper>

          <SectionCard
            title="Porosite"
            description="Grupuar sipas BatchID"
          >
            {loading ? (
              <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">
                  Duke ngarkuar...
                </Typography>
              </Stack>
            ) : filteredGroups.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nuk u gjeten porosi me filtrat aktuale.
              </Typography>
            ) : (
              <Grid container spacing={2}>
                {filteredGroups.map((group) => (
                  <Grid item xs={12} md={6} key={group.key}>
                    <Paper
                      variant="outlined"
                      sx={{ p: 2, borderRadius: 3, height: "100%" }}
                    >
                      <Stack spacing={1.2}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="h6" sx={{ flexGrow: 1 }}>
                            {group.importer}
                          </Typography>
                          {group.batchId && (
                            <Chip
                              label={`Batch ${String(group.batchId).slice(0, 8)}`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          Kerkuesi: {group.requester}
                        </Typography>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <Chip
                            label={`Kerkesa: ${formatDate(group.requestDate)}`}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={`Planifikuar: ${formatDate(group.plannedArrivalDate)}`}
                            size="small"
                            variant="outlined"
                          />
                          {group.actualArrivalDate && (
                            <Chip
                              label={`Faktike: ${formatDate(group.actualArrivalDate)}`}
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          )}
                        </Stack>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          <Chip
                            label={`${group.items.length} artikuj`}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          <Chip
                            label={`Status: ${Array.from(group.statuses).join(" | ")}`}
                            size="small"
                            variant="outlined"
                          />
                        </Stack>
                        <Divider />
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleOpenHistory(group)}
                            disabled={!group.batchId}
                          >
                            Historiku
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </SectionCard>
        </Stack>
      </Container>

      <Dialog
        open={historyOpen}
        onClose={historyLoading ? undefined : handleCloseHistory}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Historiku i batch-it</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {historyError && <Alert severity="error">{historyError}</Alert>}
            {historyLoading ? (
              <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary">
                  Duke ngarkuar historikun...
                </Typography>
              </Stack>
            ) : historyLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nuk ka loge per kete batch.
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.5}>
                {historyLogs.map((log, index) => (
                  <Box key={`${log.Action}-${log.CreatedAt}-${index}`}>
                    <Typography variant="subtitle2">{log.Action}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {log.Details || "Pa detaje."}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} useFlexGap flexWrap="wrap">
                      <Chip
                        label={log.Username || "Perdorues i panjohur"}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={
                          log.CreatedAt
                            ? new Date(log.CreatedAt).toLocaleString()
                            : "Koha e panjohur"
                        }
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseHistory} disabled={historyLoading}>
            Mbyll
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
