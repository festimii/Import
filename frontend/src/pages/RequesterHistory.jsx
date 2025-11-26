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
  Pagination,
  Stack,
  TextField,
  Typography,
  MenuItem,
} from "@mui/material";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
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
        relations: [],
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

    const docRef = item.DocumentReference;
    if (docRef?.relatedBatchId) {
      const exists = group.relations.some(
        (rel) =>
          rel.batchId === docRef.relatedBatchId &&
          (rel.role || "related") === (docRef.role || "related")
      );
      if (!exists) {
        group.relations.push({
          batchId: docRef.relatedBatchId,
          role: docRef.role || "related",
          documentNumber: docRef.number || docRef.documentNumber || null,
        });
      }
    }
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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [activeBatchId, setActiveBatchId] = useState(null);
  const normalizedHistoryLogs = useMemo(() => {
    const dedup = new Set();
    const withDefaults = (historyLogs || []).map((log) => ({
      ...log,
      Action: log.Action || log.action || "unknown",
      Details: log.Details || log.details || "Pa detaje.",
      Username: log.Username || log.username || "Perdorues i panjohur",
      CreatedAt: log.CreatedAt || log.createdAt || log.created_at || null,
      Snapshot: log.Snapshot || log.snapshot || null,
    }));

    return withDefaults
      .filter((log) => {
        const key = [
          log.Action,
          log.Details,
          log.Username,
          log.CreatedAt,
        ].join("|");
        if (dedup.has(key)) return false;
        dedup.add(key);
        return true;
      })
      .sort((a, b) => {
        const aTime = a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0;
        const bTime = b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [historyLogs]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await API.get("/imports/history", {
        params: {
          page,
          pageSize,
          sortBy,
          sortDir,
          q: searchQuery || undefined,
          from: filterFrom || undefined,
          to: filterTo || undefined,
          status: filterStatus !== "all" ? filterStatus : undefined,
        },
      });

      const data = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.items)
        ? response.data.items
        : [];
      setRecords(data);
      setTotal(
        Number(
          response.data?.total ?? (Array.isArray(response.data) ? data.length : 0)
        )
      );
    } catch (error) {
      try {
        // Fallback for older backends that might not expose /history yet.
        const mineResponse = await API.get("/imports/mine");
        setRecords(Array.isArray(mineResponse.data) ? mineResponse.data : []);
        setTotal(Array.isArray(mineResponse.data) ? mineResponse.data.length : 0);
      } catch (fallbackError) {
        setFeedback({
          severity: "error",
          message:
            fallbackError?.response?.data?.message ||
            "Nuk mund te ngarkojme porosite. Provoni perseri.",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [filterFrom, filterStatus, filterTo, page, pageSize, searchQuery, sortBy, sortDir]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const grouped = useMemo(() => groupByBatch(records), [records]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((total || records.length) / pageSize)),
    [pageSize, records.length, total]
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleExportCsv = async () => {
    try {
      const response = await API.get("/imports/history", {
        params: {
          page: 1,
          pageSize: Math.max(pageSize, 500),
          sortBy,
          sortDir,
          q: searchQuery || undefined,
          from: filterFrom || undefined,
          to: filterTo || undefined,
          status: filterStatus !== "all" ? filterStatus : undefined,
        },
      });
      const data = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.items)
        ? response.data.items
        : [];

      if (data.length === 0) return;
      const exportGroups = groupByBatch(data);

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
      exportGroups.forEach((group) => {
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
    } catch (error) {
      setFeedback({
        severity: "error",
        message:
          error?.response?.data?.message ||
          "Eksporti CSV deshtoi. Provoni perseri.",
      });
    }
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
            key="help"
            variant="text"
            component={RouterLink}
            to="/help"
            startIcon={<HelpOutlineRoundedIcon />}
          >
            Help
          </Button>,
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
              label="Kerko (importues, artikull, koment, batch)"
              size="small"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 240 }}
            />
            <TextField
              label="Nga data"
              type="date"
              size="small"
              value={filterFrom}
              onChange={(e) => {
                setFilterFrom(e.target.value);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Deri me"
              type="date"
              size="small"
              value={filterTo}
              onChange={(e) => {
                setFilterTo(e.target.value);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Statusi"
              select
              size="small"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
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
            <TextField
              label="Rendit sipas"
              select
              size="small"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="createdAt">Krijuar me</MenuItem>
              <MenuItem value="requestDate">Data e kerkeses</MenuItem>
              <MenuItem value="arrivalDate">Data e planifikuar</MenuItem>
              <MenuItem value="actualArrivalDate">Data faktike</MenuItem>
              <MenuItem value="status">Statusi</MenuItem>
            </TextField>
            <TextField
              label="Drejtimi"
              select
              size="small"
              value={sortDir}
              onChange={(e) => {
                setSortDir(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="desc">Zbrites</MenuItem>
              <MenuItem value="asc">Ngjites</MenuItem>
            </TextField>
            <TextField
              label="Rreshta"
              select
              size="small"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              sx={{ minWidth: 120 }}
            >
              {[10, 25, 50, 100, 200].map((size) => (
                <MenuItem key={size} value={size}>
                  {size} / faqe
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={handleExportCsv}
                disabled={grouped.length === 0}
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
            ) : grouped.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nuk u gjeten porosi me filtrat aktuale.
              </Typography>
            ) : (
              <Stack spacing={2}>
                <Grid container spacing={2}>
                  {grouped.map((group) => (
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
                          {group.relations.length > 0 && (
                            <Stack spacing={0.5}>
                              <Typography variant="caption" color="text.secondary">
                                Batch i lidhur
                              </Typography>
                              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                {group.relations.map((rel) => (
                                  <Chip
                                    key={`${rel.batchId}-${rel.role}`}
                                    label={`${rel.role === "remaining" ? "Pjesa e mbetur" : "Dorezuar"} • ${String(rel.batchId).slice(0, 8)}`}
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleOpenHistory({ batchId: rel.batchId })}
                                  />
                                ))}
                                {group.relations.some((rel) => rel.documentNumber) && (
                                  <Chip
                                    label={`Dokument: ${
                                      group.relations.find((rel) => rel.documentNumber)
                                        ?.documentNumber
                                    }`}
                                    size="small"
                                    variant="outlined"
                                  />
                                )}
                              </Stack>
                            </Stack>
                          )}
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
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                  justifyContent="space-between"
                  spacing={1}
                >
                  <Typography variant="body2" color="text.secondary">
                    {total || records.length} rezultate • Faqja {page} / {totalPages}
                  </Typography>
                  <Pagination
                    color="primary"
                    shape="rounded"
                    count={totalPages}
                    page={page}
                    onChange={(_, value) => setPage(value)}
                  />
                </Stack>
              </Stack>
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
            ) : normalizedHistoryLogs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nuk ka loge per kete batch.
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.5}>
                {normalizedHistoryLogs.map((log, index) => (
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
                    {log.Snapshot && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Snapshot
                        </Typography>
                        <Typography
                          component="pre"
                          variant="body2"
                          sx={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            bgcolor: "grey.50",
                            borderRadius: 1,
                            p: 1,
                            fontFamily: "monospace",
                            fontSize: 12,
                            mt: 0.5,
                          }}
                        >
                          {typeof log.Snapshot === "string"
                            ? log.Snapshot
                            : JSON.stringify(log.Snapshot, null, 2)}
                        </Typography>
                      </Box>
                    )}
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
