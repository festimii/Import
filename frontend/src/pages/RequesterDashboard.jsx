import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import API from "../api";
import formatArticleCode, { formatArticleLabel } from "../utils/formatArticle";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import SectionCard from "../components/SectionCard";
import NotificationMenu from "../components/NotificationMenu";

const today = () => new Date().toISOString().split("T")[0];

const SUMMARY_METRICS = [
  {
    key: "totalBoxes",
    field: "BoxCount",
    label: "Total boxes",
    fractionDigits: 0,
  },
  {
    key: "totalPallets",
    field: "PalletCount",
    label: "Total pallets required",
    fractionDigits: 0,
  },
  {
    key: "totalFullPallets",
    field: "FullPallets",
    label: "Full pallets",
    fractionDigits: 2,
  },
  {
    key: "totalRemainingBoxes",
    field: "RemainingBoxes",
    label: "Remaining boxes",
    fractionDigits: 0,
  },
  {
    key: "totalWeightFull",
    field: "WeightFullPalletsKg",
    label: "Weight of full pallets (kg)",
    fractionDigits: 2,
  },
  {
    key: "totalVolumeFull",
    field: "VolumeFullPalletsM3",
    label: "Volume of full pallets (m³)",
    fractionDigits: 3,
  },
  {
    key: "totalWeightRemaining",
    field: "WeightRemainingKg",
    label: "Weight of remaining boxes (kg)",
    fractionDigits: 2,
  },
  {
    key: "totalVolumeRemaining",
    field: "VolumeRemainingM3",
    label: "Volume of remaining boxes (m³)",
    fractionDigits: 3,
  },
  {
    key: "totalShipmentWeight",
    field: "TotalShipmentWeightKg",
    label: "Total shipment weight (kg)",
    fractionDigits: 2,
  },
  {
    key: "totalShipmentVolume",
    field: "TotalShipmentVolumeM3",
    label: "Total shipment volume (m³)",
    fractionDigits: 3,
  },
];

const PRIMARY_SUMMARY_KEYS = new Set([
  "totalBoxes",
  "totalPallets",
  "totalShipmentWeight",
  "totalShipmentVolume",
]);

const ITEM_COLUMNS = [
  {
    field: "Article",
    label: "Article",
    format: (value, row) => formatArticleLabel(value, row.ArticleName),
  },
  { field: "BoxCount", label: "Boxes", fractionDigits: 0 },
  { field: "PalletCount", label: "Pallets", fractionDigits: 0 },
  { field: "BoxesPerPallet", label: "Boxes / pallet", fractionDigits: 2 },
  { field: "BoxesPerLayer", label: "Boxes / layer", fractionDigits: 2 },
  { field: "LayersPerPallet", label: "Layers / pallet", fractionDigits: 2 },
  { field: "FullPallets", label: "Full pallets", fractionDigits: 2 },
  { field: "RemainingBoxes", label: "Remaining boxes", fractionDigits: 0 },
  { field: "PalletWeightKg", label: "Pallet weight (kg)", fractionDigits: 2 },
  { field: "PalletVolumeM3", label: "Pallet volume (m³)", fractionDigits: 3 },
  { field: "BoxWeightKg", label: "Box weight (kg)", fractionDigits: 2 },
  { field: "BoxVolumeM3", label: "Box volume (m³)", fractionDigits: 3 },
  {
    field: "PalletVolumeUtilization",
    label: "Pallet volume utilization",
    fractionDigits: 2,
  },
  {
    field: "WeightFullPalletsKg",
    label: "Weight of full pallets (kg)",
    fractionDigits: 2,
  },
  {
    field: "VolumeFullPalletsM3",
    label: "Volume of full pallets (m³)",
    fractionDigits: 3,
  },
  {
    field: "WeightRemainingKg",
    label: "Weight of remaining boxes (kg)",
    fractionDigits: 2,
  },
  {
    field: "VolumeRemainingM3",
    label: "Volume of remaining boxes (m³)",
    fractionDigits: 3,
  },
  {
    field: "TotalShipmentWeightKg",
    label: "Total shipment weight (kg)",
    fractionDigits: 2,
  },
  {
    field: "TotalShipmentVolumeM3",
    label: "Total shipment volume (m³)",
    fractionDigits: 3,
  },
];

const decodeUsernameFromToken = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const token = window.localStorage?.getItem("token");
  if (!token) {
    return null;
  }
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) {
      return null;
    }
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(window.atob(normalized));
    return decoded.username ?? decoded.sub ?? null;
  } catch {
    return null;
  }
};

const STATUS_COLOR_MAP = {
  approved: "success",
  pending: "warning",
  rejected: "error",
};

const NON_PENDING_STATUSES = new Set([
  "approved",
  "rejected",
  "completed",
  "cancelled",
  "archived",
]);

const isPendingStatus = (status) => {
  const normalized = String(status ?? "").toLowerCase();
  if (!normalized) {
    return true;
  }
  return !NON_PENDING_STATUSES.has(normalized);
};

const pickEarlierDateValue = (currentValue, candidate) => {
  if (!candidate) {
    return currentValue ?? null;
  }
  if (!currentValue) {
    return candidate;
  }
  const currentTime = new Date(currentValue).getTime();
  const candidateTime = new Date(candidate).getTime();
  if (Number.isNaN(currentTime) || Number.isNaN(candidateTime)) {
    return currentValue;
  }
  return candidateTime < currentTime ? candidate : currentValue;
};

const toDateInputValue = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === "string" && value.length >= 10
      ? value.slice(0, 10)
      : "";
  }
  return parsed.toISOString().split("T")[0];
};

const formatDateLabel = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === "string" && value.trim().length > 0 ? value : "N/A";
  }
  return parsed.toLocaleDateString();
};

const describeVarianceLabel = (planned, actual) => {
  if (!planned || !actual) {
    return null;
  }
  const plannedTime = new Date(planned).getTime();
  const actualTime = new Date(actual).getTime();
  if (Number.isNaN(plannedTime) || Number.isNaN(actualTime)) {
    return null;
  }
  const diffDays = Math.round(
    (actualTime - plannedTime) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) {
    return "On time";
  }
  const direction = diffDays > 0 ? "late" : "early";
  const absoluteDays = Math.abs(diffDays);
  return `${absoluteDays} day${absoluteDays === 1 ? "" : "s"} ${direction}`;
};

const formatStatusLabel = (status) => {
  const normalized = String(status ?? "pending").toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getStatusChipColor = (status, isMixed) => {
  if (isMixed) {
    return "info";
  }
  return STATUS_COLOR_MAP[status] ?? "default";
};

const sanitizeGuid = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[{}]/g, "").trim();
  if (!trimmed || trimmed.toLowerCase() === "null") {
    return null;
  }
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
    return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(
      12,
      16
    )}-${trimmed.slice(16, 20)}-${trimmed.slice(20)}`;
  }
  return trimmed;
};

const formatBatchLabel = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }
  return value.slice(0, 8).toUpperCase();
};

const PendingRequestsDialog = ({
  open,
  onClose,
  groups = [],
  loading,
  lastSyncedLabel,
  onRefresh,
}) => {
  const totalArticles = useMemo(
    () =>
      groups.reduce(
        (sum, group) => sum + (group?.items?.length ?? 0),
        0
      ),
    [groups]
  );

  const dialogBody = (() => {
    if (loading) {
      return (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary">
            Duke kontrolluar porositë në pritje...
          </Typography>
        </Stack>
      );
    }

    if (groups.length === 0) {
      return (
        <Alert severity="success">
          Nuk ka porosi në pritje për konfirmim.
        </Alert>
      );
    }

    return (
      <Stack divider={<Divider flexItem />} spacing={2}>
        {groups.map((group) => {
          const plannedLabel = formatDateLabel(
            group.plannedArrivalDate ??
              group.requestDate ??
              group.createdAt ??
              null
          );
          const batchLabel = formatBatchLabel(group.batchId);
          const articleCount = group.items?.length ?? 0;
          const createdLabel = group.createdAt
            ? formatDateLabel(group.createdAt)
            : null;

          return (
            <Box key={group.key}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
              >
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {group.importer}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Planifikuar: {plannedLabel}
                  </Typography>
                </Box>
                <Chip
                  label={group.statusLabel}
                  color={group.statusColor || "default"}
                  size="small"
                  variant="outlined"
                />
              </Stack>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ mt: 1 }}
                flexWrap="wrap"
              >
                <Typography variant="body2" color="text.secondary">
                  Artikuj: {articleCount}
                </Typography>
                {group.varianceLabel && (
                  <Typography variant="body2" color="text.secondary">
                    Devijim: {group.varianceLabel}
                  </Typography>
                )}
                {batchLabel && (
                  <Typography variant="body2" color="text.secondary">
                    Batch: {batchLabel}
                  </Typography>
                )}
                {createdLabel && (
                  <Typography variant="body2" color="text.secondary">
                    Krijuar: {createdLabel}
                  </Typography>
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    );
  })();

  const groupLabel = groups.length === 1 ? "grup" : "grupe";

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Porositë në pritje</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                {lastSyncedLabel}
              </Typography>
              <Typography variant="body2" color="text.primary">
                {groups.length} {groupLabel} • {totalArticles} artikuj
              </Typography>
            </Stack>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshRoundedIcon />}
              onClick={onRefresh}
              disabled={loading}
            >
              Rifresko
            </Button>
          </Stack>
          {dialogBody}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mbyll</Button>
      </DialogActions>
    </Dialog>
  );
};

export default function RequesterDashboard() {
  const currentDate = today();
  const requesterUsername = useMemo(() => decodeUsernameFromToken(), []);
  const [importer, setImporter] = useState("");
  const [items, setItems] = useState([{ article: "", boxCount: "" }]);
  const [arrivalDate, setArrivalDate] = useState("");
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submissionDetails, setSubmissionDetails] = useState(null);
  const excelInputRef = useRef(null);
  const [excelFiles, setExcelFiles] = useState([]);
  const [showAdvancedTotals, setShowAdvancedTotals] = useState(false);
  const [showItemBreakdown, setShowItemBreakdown] = useState(false);
  const [submittedRequests, setSubmittedRequests] = useState([]);
  const [submittedLoading, setSubmittedLoading] = useState(true);
  const [submittedFeedback, setSubmittedFeedback] = useState(null);
  const [requestsLastLoadedAt, setRequestsLastLoadedAt] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editArrivalDate, setEditArrivalDate] = useState("");
  const [editFeedback, setEditFeedback] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState(null);

  const loadSubmittedRequests = useCallback(async () => {
    setSubmittedLoading(true);
    try {
      const response = await API.get("/imports/mine");
      const records = Array.isArray(response.data) ? response.data : [];
      setSubmittedRequests(records);
      setRequestsLastLoadedAt(new Date());
      setSubmittedFeedback((previous) =>
        previous?.severity === "error" ? null : previous
      );
    } catch (error) {
      setSubmittedFeedback({
        severity: "error",
        message:
          error?.response?.data?.message ??
          "We couldn't load your submitted imports. Please try again.",
      });
    } finally {
      setSubmittedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubmittedRequests();
  }, [loadSubmittedRequests]);

  const handleItemChange = (index, field, value) => {
    setItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  };

  const handleAddItem = () => {
    setItems((previous) => [...previous, { article: "", boxCount: "" }]);
  };

  const handleRemoveItem = (index) => {
    setItems((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const handleExcelChange = (event) => {
    const files = Array.from(event.target.files ?? []);
    setExcelFiles(files);
  };

  const handleExcelClear = () => {
    setExcelFiles([]);
    if (excelInputRef.current) {
      excelInputRef.current.value = "";
    }
  };

  const resetFormState = () => {
    setImporter("");
    setArrivalDate("");
    setComment("");
    setItems([{ article: "", boxCount: "" }]);
    setExcelFiles([]);
    if (excelInputRef.current) {
      excelInputRef.current.value = "";
    }
    setEditingSubmission(null);
  };

  const handleStartEditGroup = (group) => {
    if (!group?.batchId) {
      setSubmittedFeedback({
        severity: "warning",
        message: "Kjo porosi nuk mbështet editimin.",
      });
      return;
    }

    const targetItems = Array.isArray(group.items) ? group.items : [];
    setImporter(group.importer ?? "");
    setArrivalDate(
      toDateInputValue(
        group.plannedArrivalDate ??
          group.actualArrivalDate ??
          group.requestDate ??
          ""
      )
    );
    setComment(targetItems[0]?.Comment ?? "");
    setItems(
      targetItems.map((item) => ({
        article: item.Article ?? "",
        boxCount:
          typeof item.BoxCount === "number"
            ? item.BoxCount
            : item.BoxCount ?? "",
      }))
    );
    setExcelFiles([]);
    if (excelInputRef.current) {
      excelInputRef.current.value = "";
    }
    setEditingSubmission({
      batchId: group.batchId,
      label: group.importer ?? formatBatchLabel(group.batchId) ?? "porosia",
      requestDate:
        toDateInputValue(group.requestDate) ??
        toDateInputValue(targetItems[0]?.RequestDate) ??
        currentDate,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEditSubmission = () => {
    resetFormState();
  };

  const handleDeleteGroup = async (group) => {
    const sanitizedBatchId = sanitizeGuid(group?.batchId);
    if (!sanitizedBatchId) {
      setSubmittedFeedback({
        severity: "warning",
        message: "Kjo porosi nuk mbështet fshirjen.",
      });
      return;
    }

    const confirmed = window.confirm(
      "Dëshironi të fshini këtë porosi? Ky veprim nuk mund të zhbëhet."
    );
    if (!confirmed) {
      return;
    }

    setDeletingBatchId(sanitizedBatchId);
    try {
      await API.delete(`/imports/batch/${sanitizedBatchId}`);
      setSubmittedFeedback({
        severity: "success",
        message: "Porosia u fshi me sukses.",
      });
      await loadSubmittedRequests();
      if (
        editingSubmission?.batchId &&
        sanitizeGuid(editingSubmission.batchId)?.toLowerCase() ===
          sanitizedBatchId.toLowerCase()
      ) {
        resetFormState();
      }
    } catch (error) {
      setSubmittedFeedback({
        severity: "error",
        message:
          error?.response?.data?.message ??
          "Nuk mundëm të fshijmë porosinë. Ju lutemi provoni përsëri.",
      });
    } finally {
      setDeletingBatchId(null);
    }
  };

  const handleOpenArrivalRevision = (group) => {
    if (!group || !group.canEditArrival) {
      return;
    }
    setEditFeedback(null);
    const defaultDate =
      group.plannedArrivalDate ??
      group.actualArrivalDate ??
      group.requestDate ??
      "";
    setEditArrivalDate(toDateInputValue(defaultDate));
    setEditingGroup(group);
  };

  const handleCloseArrivalRevision = () => {
    if (editSubmitting) {
      return;
    }
    setEditingGroup(null);
    setEditArrivalDate("");
    setEditFeedback(null);
  };

  const handleSubmitArrivalRevision = async () => {
    if (!editingGroup) return;
    if (!editArrivalDate) {
      setEditFeedback({
        severity: "error",
        message: "Please choose a new arrival date before continuing.",
      });
      return;
    }

    setEditSubmitting(true);
    setEditFeedback(null);
    try {
      await Promise.all(
        editingGroup.items.map((item) =>
          API.patch(`/imports/${item.ID}/requester-arrival`, {
            arrivalDate: editArrivalDate,
          })
        )
      );
      setSubmittedFeedback({
        severity: "success",
        message: `Updated the planned arrival for ${
          editingGroup.items.length
        } article${editingGroup.items.length === 1 ? "" : "s"}.`,
      });
      handleCloseArrivalRevision();
      await loadSubmittedRequests();
    } catch (error) {
      setEditFeedback({
        severity: "error",
        message:
          error?.response?.data?.message ??
          "We couldn't update the arrival date. Please try again.",
      });
    } finally {
      setEditSubmitting(false);
    }
  };

  const extractSubmittedItems = (payload) => {
    if (!payload) {
      return [];
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    return [payload];
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);

    const isEditingSubmission = Boolean(editingSubmission);
    const hasExcelFiles = excelFiles.length > 0;
    const importerValue = importer.trim();

    if (isEditingSubmission && hasExcelFiles) {
      setFeedback({
        severity: "error",
        message: "Përditësimi i porosisë nuk mbështet ngarkimin e Excel.",
      });
      return;
    }

    if (!arrivalDate && !hasExcelFiles) {
      setFeedback({
        severity: "error",
        message: "Please provide an arrival date for the import.",
      });
      return;
    }

    if (!importerValue && !hasExcelFiles) {
      setFeedback({
        severity: "error",
        message: "Please provide the importer name for this order.",
      });
      return;
    }

    const preparedItems = [];

    if (!hasExcelFiles) {
      for (let index = 0; index < items.length; index += 1) {
        const current = items[index];
        const trimmedArticle = (current.article ?? "").trim();

        if (!trimmedArticle) {
          setFeedback({
            severity: "error",
            message: `Please provide an article code for item ${index + 1}.`,
          });
          return;
        }

        const parsedBoxCount = Number(current.boxCount);

        if (!Number.isFinite(parsedBoxCount) || parsedBoxCount <= 0) {
          setFeedback({
            severity: "error",
            message: `Please provide a positive box quantity for item ${
              index + 1
            }.`,
          });
          return;
        }

        preparedItems.push({
          article: formatArticleCode(trimmedArticle),
          boxCount: parsedBoxCount,
        });
      }
    }

    setFormSubmitting(true);

    try {
    if (isEditingSubmission) {
      const sanitizedBatchId = sanitizeGuid(editingSubmission.batchId);
      if (!sanitizedBatchId) {
        setFeedback({
          severity: "error",
          message:
            "Nuk mund të gjejmë këtë porosi për përditësim. Rifreskoni faqen dhe provoni përsëri.",
        });
        setFormSubmitting(false);
        return;
      }

      await API.put(`/imports/batch/${sanitizedBatchId}`, {
        requestDate: editingSubmission.requestDate ?? currentDate,
        arrivalDate,
        importer: importerValue,
        comment,
        items: preparedItems,
        });

        setFeedback({
          severity: "success",
          message: "Porosia u përditësua dhe u ridërgua për konfirmim.",
        });
        resetFormState();
      } else {
        let response;

        if (hasExcelFiles) {
          const formData = new FormData();
          formData.append("requestDate", currentDate);
          if (importerValue) {
            formData.append("importer", importerValue);
          }
          if (arrivalDate) {
            formData.append("arrivalDate", arrivalDate);
          }
          if (comment.trim()) {
            formData.append("comment", comment);
          }
          excelFiles.forEach((file) =>
            formData.append("files", file, file.name)
          );
          response = await API.post("/imports/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } else {
          response = await API.post("/imports", {
            requestDate: currentDate,
            arrivalDate,
            importer: importerValue,
            comment,
            items: preparedItems,
          });
        }

        const payload = response.data;
        const normalizedPayload = extractSubmittedItems(payload);
        setFeedback({
          severity: "success",
          message: hasExcelFiles
            ? `Imported ${normalizedPayload.length} row${
                normalizedPayload.length === 1 ? "" : "s"
              } from Excel successfully.`
            : "Import order submitted successfully.",
        });
        if (hasExcelFiles) {
          setImporter(payload?.importer ?? "");
          setArrivalDate(payload?.arrivalDate ?? "");
        } else {
          setImporter("");
          setArrivalDate("");
        }
        setItems([{ article: "", boxCount: "" }]);
        setComment("");
        setSubmissionDetails(
          normalizedPayload.length > 0 ? { items: normalizedPayload } : null
        );
        if (hasExcelFiles) {
          handleExcelClear();
        }
      }

      await loadSubmittedRequests();
    } catch (error) {
      setFeedback({
        severity: "error",
        message:
          error.response?.data?.message ||
          "Something went wrong while creating the order.",
      });
    } finally {
      setFormSubmitting(false);
    }
  };

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const upcomingArrival = useMemo(() => {
    if (!arrivalDate) return "Select a date";
    return new Date(arrivalDate).toLocaleDateString();
  }, [arrivalDate]);

  const latestItems = submissionDetails?.items ?? [];
  const firstSubmittedItem = latestItems[0] ?? {};

  const summaryTotals = useMemo(() => {
    if (latestItems.length === 0) {
      return null;
    }

    const totals = SUMMARY_METRICS.reduce((acc, metric) => {
      acc[metric.key] = { value: 0, hasValue: false };
      return acc;
    }, {});

    for (const item of latestItems) {
      for (const metric of SUMMARY_METRICS) {
        const rawValue = item[metric.field];
        if (rawValue === null || rawValue === undefined) {
          continue;
        }
        const numeric = Number(rawValue);
        if (Number.isFinite(numeric)) {
          totals[metric.key].value += numeric;
          totals[metric.key].hasValue = true;
        }
      }
    }

    return {
      totals,
      itemCount: latestItems.length,
    };
  }, [latestItems]);

  const summaryMetricGroups = useMemo(() => {
    if (!summaryTotals) {
      return { primary: [], secondary: [] };
    }

    const metricsWithValues = SUMMARY_METRICS.filter(
      (metric) => summaryTotals.totals[metric.key].hasValue
    );

    return {
      primary: metricsWithValues.filter((metric) =>
        PRIMARY_SUMMARY_KEYS.has(metric.key)
      ),
      secondary: metricsWithValues.filter(
        (metric) => !PRIMARY_SUMMARY_KEYS.has(metric.key)
      ),
    };
  }, [summaryTotals]);

  const renderSummaryMetric = (metric) => {
    if (!summaryTotals) {
      return null;
    }
    const metricValue = summaryTotals.totals[metric.key]?.value ?? 0;

    return (
      <Grid item xs={12} sm={6} md={4} key={metric.key}>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            backgroundColor: "background.paper",
          }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            {metric.label}
          </Typography>
          <Typography variant="h6">
            {formatQuantity(metricValue, metric.fractionDigits)}
          </Typography>
        </Box>
      </Grid>
    );
  };

  const renderInfoItem = (label, value, helperText) => (
    <Stack key={label} spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1" fontWeight={600}>
        {value}
      </Typography>
      {helperText && (
        <Typography variant="caption" color="text.secondary">
          {helperText}
        </Typography>
      )}
    </Stack>
  );

  const summarySnapshot = summaryTotals
    ? [
        { label: "Importer", value: firstSubmittedItem.Importer ?? "--" },
        {
          label: "Request date",
          value: formatDateValue(firstSubmittedItem.RequestDate),
        },
        {
          label: "Arrival",
          value: formatDateValue(firstSubmittedItem.ArrivalDate),
        },
        { label: "Articles", value: summaryTotals.itemCount ?? 0 },
      ]
    : [];

  const groupedSubmissions = useMemo(() => {
    if (!Array.isArray(submittedRequests) || submittedRequests.length === 0) {
      return [];
    }
    const groups = new Map();

    submittedRequests.forEach((request, index) => {
      if (!request) return;
      const key = request.BatchId ?? `legacy-${request.ID ?? index}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          batchId: request.BatchId ?? null,
          importer: request.Importer ?? "Unknown importer",
          items: [],
          articleDetails: [],
          statusCounts: {},
          statuses: new Set(),
          requestDate: null,
          plannedArrivalDate: null,
          actualArrivalDate: null,
          hasActualArrival: false,
          createdAt: request.CreatedAt ?? null,
        });
      }
      const group = groups.get(key);
      group.items.push(request);
      group.articleDetails.push({
        article: request.Article,
        articleName: request.ArticleName,
      });
      group.requestDate = pickEarlierDateValue(
        group.requestDate,
        request.RequestDate
      );
      group.plannedArrivalDate = pickEarlierDateValue(
        group.plannedArrivalDate,
        request.PlannedArrivalDate ?? request.ArrivalDate ?? null
      );
      if (request.ActualArrivalDate) {
        group.hasActualArrival = true;
        group.actualArrivalDate = pickEarlierDateValue(
          group.actualArrivalDate,
          request.ActualArrivalDate
        );
      }
      group.createdAt = pickEarlierDateValue(
        group.createdAt,
        request.CreatedAt
      );
      if (request.Importer) {
        group.importer = request.Importer;
      }
      const normalizedStatus = (request.Status || "pending").toLowerCase();
      group.statusCounts[normalizedStatus] =
        (group.statusCounts[normalizedStatus] || 0) + 1;
      group.statuses.add(normalizedStatus);
    });

    return Array.from(groups.values())
      .map((group) => {
        const statuses = Array.from(group.statuses);
        const isMixed = statuses.length > 1;
        const primaryStatus = isMixed ? null : statuses[0];
        const pending = statuses.some(isPendingStatus);
        return {
          ...group,
          statuses,
          statusLabel: isMixed
            ? "Multiple statuses"
            : formatStatusLabel(primaryStatus),
          statusColor: getStatusChipColor(primaryStatus, isMixed),
          varianceLabel: describeVarianceLabel(
            group.plannedArrivalDate,
            group.actualArrivalDate
          ),
          canEditArrival: !group.hasActualArrival,
          isPending: pending,
        };
      })
      .sort((a, b) => {
        const aTime = (() => {
          const source =
            a.plannedArrivalDate || a.requestDate || a.createdAt || null;
          if (!source) return 0;
          const parsed = new Date(source);
          return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        })();
        const bTime = (() => {
          const source =
            b.plannedArrivalDate || b.requestDate || b.createdAt || null;
          if (!source) return 0;
          const parsed = new Date(source);
          return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        })();
        return bTime - aTime;
      });
  }, [submittedRequests]);

  const findGroupByBatchId = (batchId) => {
    if (!batchId) return null;
    const normalized = sanitizeGuid(batchId);
    if (!normalized) {
      return null;
    }
    return groupedSubmissions.find((group) => {
      if (!group.batchId) return false;
      return sanitizeGuid(group.batchId)?.toLowerCase() ===
        normalized.toLowerCase();
    });
  };

  const handleCalendarEditBatch = (batch) => {
    const match = findGroupByBatchId(batch?.BatchId);
    if (!match) {
      setSubmittedFeedback({
        severity: "warning",
        message:
          "Nuk mundëm të gjenim artikujt për këtë porosi. Rifreskoni dhe provoni përsëri.",
      });
      return;
    }
    handleStartEditGroup(match);
  };

  const handleCalendarDeleteBatch = (batch) => {
    const match = findGroupByBatchId(batch?.BatchId);
    if (!match) {
      setSubmittedFeedback({
        severity: "warning",
        message:
          "Nuk mundëm të gjenim artikujt për këtë porosi. Rifreskoni dhe provoni përsëri.",
      });
      return;
    }
    handleDeleteGroup(match);
  };

  const pendingGroups = useMemo(
    () => groupedSubmissions.filter((group) => group.isPending),
    [groupedSubmissions]
  );

  const pendingSummary = useMemo(
    () => ({
      totalGroups: pendingGroups.length,
      totalArticles: pendingGroups.reduce(
        (sum, group) => sum + (group.items?.length ?? 0),
        0
      ),
    }),
    [pendingGroups]
  );

  const pendingButtonLabel =
    pendingSummary.totalGroups > 0
      ? `${pendingSummary.totalGroups} në pritje`
      : "Pa porosi në pritje";
  const isEditingSubmission = Boolean(editingSubmission);

  const requestsLastSyncedLabel = useMemo(() => {
    if (!requestsLastLoadedAt) {
      return submittedLoading
        ? "Syncing your submissions..."
        : "Not synced yet";
    }
    return `Updated ${requestsLastLoadedAt.toLocaleString()}`;
  }, [requestsLastLoadedAt, submittedLoading]);

  const formatQuantity = (value, fractionDigits = 0) => {
    if (value === null || value === undefined) {
      return "—";
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return "—";
    }
    return numericValue.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  };

  function formatDateValue(value) {
    if (!value) return "N/A";
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    if (typeof value === "string") {
      return value;
    }
    return "N/A";
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: (theme) =>
          `linear-gradient(180deg, ${alpha(
            theme.palette.primary.light,
            0.12
          )} 0%, ${theme.palette.background.default} 40%, ${
            theme.palette.background.paper
          } 100%)`,
      }}
    >
      <PageHero
        title="Stock Menagment"
        subtitle=""
        actions={[
          <Button
            key="pending"
            variant="outlined"
            color={pendingSummary.totalGroups > 0 ? "warning" : "inherit"}
            startIcon={<PendingActionsRoundedIcon />}
            onClick={() => setPendingDialogOpen(true)}
          >
            {pendingButtonLabel}
          </Button>,
          <NotificationMenu key="notifications" />,
          <Button
            key="logout"
            variant="contained"
            color="secondary"
            onClick={logout}
          >
            Logout
          </Button>,
        ]}
      ></PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>
          {submittedFeedback && (
            <Alert severity={submittedFeedback.severity}>
              {submittedFeedback.message}
            </Alert>
          )}
          <SectionCard
            title="Krijo porosi te re"
            description="Vendos detajet e porosise se importit per te filluar procesin e palletizimit dhe planifikimit te ardhjes."
          >
            <Stack spacing={4}>
              {feedback && (
                <Alert severity={feedback.severity}>{feedback.message}</Alert>
              )}
              {isEditingSubmission && (
                <Alert
                  severity="info"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      startIcon={<UndoRoundedIcon />}
                      onClick={handleCancelEditSubmission}
                    >
                      Dil nga editimi
                    </Button>
                  }
                >
                  Duke përditësuar{" "}
                  <Typography component="span" fontWeight={600}>
                    {editingSubmission.label}
                  </Typography>
                  . Ndryshimet do të ridërgohen për konfirmim.
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit} noValidate>
                <Stack spacing={4}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Data Krijimit"
                        type="date"
                        value={currentDate}
                        disabled
                        InputLabelProps={{ shrink: true }}
                        helperText="Gjenerohet automatikisht"
                        required
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Furnitori"
                        value={importer}
                        onChange={(event) => setImporter(event.target.value)}
                        placeholder="Furnitori i importit"
                        helperText="Emri i kompanise qe po furnizon mallin"
                        required
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Data Arritjes"
                        type="date"
                        value={arrivalDate}
                        onChange={(event) => setArrivalDate(event.target.value)}
                        InputLabelProps={{ shrink: true }}
                        helperText="Data e parashikuar e arritjes ne depo"
                        required
                        fullWidth
                      />
                    </Grid>
                  </Grid>

                  <Divider textAlign="left">Artikujt e porosise</Divider>

                  <Stack spacing={2.5}>
                    {items.map((item, index) => (
                      <Paper
                        key={`order-item-${index}`}
                        variant="outlined"
                        sx={{
                          p: { xs: 2, md: 3 },
                          borderRadius: 3,
                          backgroundColor: (theme) =>
                            alpha(theme.palette.primary.light, 0.02),
                        }}
                      >
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          justifyContent="space-between"
                          sx={{ mb: 2 }}
                        >
                          <Typography variant="subtitle2">
                            Artikulli {index + 1}
                          </Typography>
                          {items.length > 1 && (
                            <Button
                              type="button"
                              color="error"
                              size="small"
                              startIcon={<DeleteOutlineRoundedIcon />}
                              onClick={() => handleRemoveItem(index)}
                            >
                              Hiq artikullin
                            </Button>
                          )}
                        </Stack>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <TextField
                              label="Sifra Artikulli"
                              value={item.article}
                              onChange={(event) =>
                                handleItemChange(
                                  index,
                                  "article",
                                  event.target.value
                                )
                              }
                              helperText="Artikujt me me pak se 6 karaktere marrin zero automatikisht"
                              required
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              label="Sasia - Pako"
                              type="number"
                              value={item.boxCount}
                              onChange={(event) =>
                                handleItemChange(
                                  index,
                                  "boxCount",
                                  event.target.value
                                )
                              }
                              inputProps={{ min: 1 }}
                              helperText="Vendos sasine ne pako per te llogaritur paletat"
                              required
                              fullWidth
                            />
                          </Grid>
                        </Grid>
                      </Paper>
                    ))}
                    <Button
                      type="button"
                      variant="outlined"
                      startIcon={<AddCircleRoundedIcon />}
                      onClick={handleAddItem}
                      sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
                    >
                      Shto artikull tjeter
                    </Button>
                  </Stack>

                  <Divider textAlign="left">
                    Import nga Excel (opsionale)
                  </Divider>

                  <Paper
                    variant="outlined"
                    sx={{
                      p: { xs: 2, md: 3 },
                      borderRadius: 3,
                      backgroundColor: (theme) =>
                        alpha(theme.palette.primary.light, 0.04),
                    }}
                  >
                    <Stack spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        Vendosni skedarin Excel per te importuar artikujt
                        automatikisht. Nese ngarkoni skedar, artikujt manuale
                        sipër do te injorohen.
                      </Typography>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        alignItems={{ sm: "center" }}
                      >
                        <Button
                          component="label"
                          variant="outlined"
                          startIcon={<CloudUploadRoundedIcon />}
                          disabled={isEditingSubmission}
                        >
                          Zgjidh Excel
                          <input
                            type="file"
                            hidden
                            multiple
                            accept=".xlsx,.xls"
                            ref={excelInputRef}
                            onChange={handleExcelChange}
                            disabled={isEditingSubmission}
                          />
                        </Button>
                        {excelFiles.length > 0 && (
                          <Button
                            type="button"
                            color="secondary"
                            startIcon={<DeleteOutlineRoundedIcon />}
                            onClick={handleExcelClear}
                            disabled={isEditingSubmission}
                          >
                            Hiq skedaret
                          </Button>
                        )}
                      </Stack>
                      {isEditingSubmission && (
                        <Typography variant="caption" color="text.secondary">
                          Ngarkimi i Excel është i çaktivizuar gjatë
                          përditësimit të një porosie ekzistuese.
                        </Typography>
                      )}
                      {excelFiles.length > 0 && (
                        <>
                          <Stack
                            direction="row"
                            spacing={1}
                            useFlexGap
                            flexWrap="wrap"
                          >
                            {excelFiles.map((file, index) => (
                              <Chip
                                key={`${file.name}-${index}`}
                                label={file.name}
                                variant="outlined"
                                size="small"
                              />
                            ))}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {`Manual entries are ignored while ${
                              excelFiles.length
                            } file${
                              excelFiles.length === 1 ? "" : "s"
                            } are attached.`}
                          </Typography>
                        </>
                      )}
                    </Stack>
                  </Paper>

                  <TextField
                    label="Vendos koment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Shto nje koment te perbashket per porosine"
                    helperText="Opsionale — p.sh. kush merr kontaktin kur arrin"
                    multiline
                    minRows={3}
                    fullWidth
                  />

                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      endIcon={<SendRoundedIcon />}
                      disabled={formSubmitting}
                    >
                      {isEditingSubmission
                        ? formSubmitting
                          ? "Duke ruajtur..."
                          : "Ruaj ndryshimet"
                        : formSubmitting
                        ? "Duke dërguar..."
                        : "Submit order"}
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </SectionCard>

          <CalendarOverview
            title="Calendari i Arritjeve te Konfirmuara"
            description=" "
            allowRequesterReschedule
            requesterUsername={requesterUsername}
            onRequesterReschedule={loadSubmittedRequests}
            onRequesterEditBatch={handleCalendarEditBatch}
            onRequesterDeleteBatch={handleCalendarDeleteBatch}
            requesterEditBatchId={editingSubmission?.batchId ?? null}
            requesterDeleteBatchId={deletingBatchId}
          />

          {latestItems.length > 0 && (
            <SectionCard
              title="Latest palletization summary"
              description="Review the calculated pallet, weight and volume metrics returned by the warehouse system for your submitted request."
            >
              <Stack spacing={3}>
                {summarySnapshot.length > 0 && (
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    useFlexGap
                    flexWrap="wrap"
                  >
                    {summarySnapshot.map((item) => (
                      <Chip
                        key={item.label}
                        label={`${item.label}: ${item.value}`}
                        variant="outlined"
                        size="small"
                      />
                    ))}
                  </Stack>
                )}

                {firstSubmittedItem.Comment && (
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Shared note
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {firstSubmittedItem.Comment}
                    </Typography>
                  </Stack>
                )}

                {summaryTotals && (
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      alignItems={{ xs: "flex-start", sm: "center" }}
                      spacing={1}
                    >
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle1">
                          Aggregated totals
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {summaryTotals.itemCount > 1
                            ? "Values include every article in your latest submission."
                            : "Values describe the most recent article submitted."}
                        </Typography>
                      </Stack>
                      {summaryMetricGroups.secondary.length > 0 && (
                        <Button
                          type="button"
                          size="small"
                          onClick={() =>
                            setShowAdvancedTotals((previous) => !previous)
                          }
                        >
                          {showAdvancedTotals
                            ? "Hide advanced metrics"
                            : "Show advanced metrics"}
                        </Button>
                      )}
                    </Stack>
                    <Grid container spacing={2}>
                      {summaryMetricGroups.primary.map((metric) =>
                        renderSummaryMetric(metric)
                      )}
                    </Grid>
                    {summaryMetricGroups.secondary.length > 0 && (
                      <Collapse in={showAdvancedTotals}>
                        <Grid container spacing={2}>
                          {summaryMetricGroups.secondary.map((metric) =>
                            renderSummaryMetric(metric)
                          )}
                        </Grid>
                      </Collapse>
                    )}
                  </Stack>
                )}

                <Stack spacing={1}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                    spacing={1}
                  >
                    <Typography variant="subtitle1">
                      Per-article breakdown
                    </Typography>
                    <Button
                      type="button"
                      size="small"
                      onClick={() =>
                        setShowItemBreakdown((previous) => !previous)
                      }
                    >
                      {showItemBreakdown ? "Hide table" : "Show table"}
                    </Button>
                  </Stack>
                  <Collapse in={showItemBreakdown}>
                    <TableContainer
                      component="div"
                      sx={{
                        overflowX: "auto",
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Table
                        size="small"
                        stickyHeader
                        aria-label="Palletization details"
                      >
                        <TableHead>
                          <TableRow>
                            {ITEM_COLUMNS.map((column) => (
                              <TableCell
                                key={column.field}
                                sx={{ whiteSpace: "nowrap" }}
                              >
                                {column.label}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {latestItems.map((item) => (
                            <TableRow
                              key={
                                item.ID ?? `${item.Article}-${item.BoxCount}`
                              }
                              hover
                            >
                              {ITEM_COLUMNS.map((column) => {
                                const rawValue = item[column.field];
                                const content = column.format
                                  ? column.format(rawValue, item)
                                  : formatQuantity(
                                      rawValue,
                                      column.fractionDigits ?? 0
                                    );
                                return (
                                  <TableCell
                                    key={column.field}
                                    sx={{ whiteSpace: "nowrap" }}
                                  >
                                    {content}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Collapse>
                </Stack>
              </Stack>
            </SectionCard>
          )}
        </Stack>
      </Container>
      <PendingRequestsDialog
        open={pendingDialogOpen}
        onClose={() => setPendingDialogOpen(false)}
        groups={pendingGroups}
        loading={submittedLoading}
        lastSyncedLabel={requestsLastSyncedLabel}
        onRefresh={loadSubmittedRequests}
      />
      <Dialog
        open={Boolean(editingGroup)}
        onClose={handleCloseArrivalRevision}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Update planned arrival</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {editingGroup && (
              <Typography variant="body2" color="text.secondary">
                Adjust the arrival date for{" "}
                <Typography
                  component="span"
                  fontWeight={600}
                  color="text.primary"
                >
                  {editingGroup.importer}
                </Typography>
                . All {editingGroup.items.length} article
                {editingGroup.items.length === 1 ? "" : "s"} in this submission
                will move back to pending confirmation.
              </Typography>
            )}
            {editFeedback && (
              <Alert severity={editFeedback.severity}>
                {editFeedback.message}
              </Alert>
            )}
            <TextField
              label="New planned arrival date"
              type="date"
              value={editArrivalDate}
              onChange={(event) => setEditArrivalDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              required
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5 }}>
          <Button
            onClick={handleCloseArrivalRevision}
            disabled={editSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitArrivalRevision}
            variant="contained"
            color="secondary"
            disabled={editSubmitting}
          >
            {editSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

