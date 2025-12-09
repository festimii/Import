import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  IconButton,
  InputLabel,
  FormControl,
  MenuItem,
  Paper,
  Select,
  TablePagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import PhotoCameraBackRoundedIcon from "@mui/icons-material/PhotoCameraBackRounded";
import PageHero from "../components/PageHero";
import SectionCard from "../components/SectionCard";
import NotificationMenu from "../components/NotificationMenu";
import API from "../api";

const emptyForm = {
  internalId: "",
  moduleId: "",
  planogramId: "",
  x: "",
  y: "",
  z: "",
};

const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const padInternalId = (value) => {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return value;
  return digits.padStart(6, "0").slice(-6);
};

const formatDecimal = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(2);
};

const extractFileName = (value) => {
  if (!value) return "";
  const parts = String(value).split(/[/\\]/);
  return parts[parts.length - 1] || value;
};

const resolveBackendBase = () => {
  const base = API?.defaults?.baseURL;
  if (!base || typeof base !== "string") return "";
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/api")) {
    return trimmed.slice(0, -4);
  }
  return trimmed;
};

export default function PlanogramDashboard() {
  const [internalIdInput, setInternalIdInput] = useState("");
  const [planogramIdFilter, setPlanogramIdFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [missingXyzFilter, setMissingXyzFilter] = useState(false);
  const [missingPhotoFilter, setMissingPhotoFilter] = useState(false);
  const [planograms, setPlanograms] = useState([]);
  const [lookupFeedback, setLookupFeedback] = useState(null);
  const [formFeedback, setFormFeedback] = useState(null);
  const [photoFeedback, setPhotoFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoFilesLoading, setPhotoFilesLoading] = useState(false);
  const [selectedExistingFile, setSelectedExistingFile] = useState("");
  const [formValues, setFormValues] = useState(emptyForm);
  const [selectedKey, setSelectedKey] = useState(null);
  const [lastQuery, setLastQuery] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalPlanograms, setTotalPlanograms] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const backendBaseUrl = useMemo(() => resolveBackendBase(), []);

  const selectedPlanogram = useMemo(() => {
    if (!selectedKey) return null;
    return planograms.find(
      (item) =>
        item.internalId === selectedKey.internalId &&
        item.sifraArt === selectedKey.sifraArt
    );
  }, [planograms, selectedKey]);

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const setFormValue = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = (presetInternalId = "", presetPlanogramId = "") => {
    setFormValues({
      ...emptyForm,
      internalId: padInternalId(presetInternalId),
      planogramId: presetPlanogramId,
    });
    setFormFeedback(null);
    setPhotoFeedback(null);
    setSelectedKey(null);
  };

  const fetchPlanograms = async ({
    pageIndex = page,
    pageSize = rowsPerPage,
    filters = lastQuery,
  } = {}) => {
    if (
      !filters ||
      (!filters.internalId &&
        !filters.planogramId &&
        !filters.moduleId &&
        !filters.missingXyz &&
        !filters.missingPhoto)
    ) {
      return;
    }

    setLoading(true);
    try {
      const params = {
        ...filters,
        page: pageIndex + 1,
        pageSize,
      };

      const endpoint = filters.internalId
        ? `/planograms/by-internal/${encodeURIComponent(filters.internalId)}`
        : "/planograms/search";

      const res = await API.get(endpoint, { params });
      const records = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
      const total = res.data?.total ?? records.length;
      setPlanograms(records);
      setTotalPlanograms(total);
      if (records.length > 0) {
        setSelectedKey({
          internalId: records[0].internalId,
          sifraArt: records[0].sifraArt,
        });
      } else {
        setSelectedKey(null);
      }
    } catch (error) {
      setLookupFeedback({
        severity: "error",
        message: "Unable to load planogram layouts right now.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event) => {
    event?.preventDefault?.();
    setLookupFeedback(null);

    const trimmedInternalId = internalIdInput.trim();
    const trimmedPlanogramId = planogramIdFilter.trim();
    const trimmedModule = moduleFilter.trim();
    const paddedInternalId = padInternalId(trimmedInternalId);

    const hasFilter =
      trimmedInternalId ||
      trimmedPlanogramId ||
      trimmedModule ||
      missingXyzFilter ||
      missingPhotoFilter;

    if (!hasFilter) {
      setLookupFeedback({
        severity: "warning",
        message:
          "Provide a filter (Internal ID, Planogram ID, Module, Missing XYZ or Missing Photo).",
      });
      return;
    }

    const filters = {
      internalId: paddedInternalId || undefined,
      planogramId: trimmedPlanogramId || undefined,
      moduleId: trimmedModule || undefined,
      missingXyz: missingXyzFilter ? "true" : undefined,
      missingPhoto: missingPhotoFilter ? "true" : undefined,
    };

    setPage(0);
    setLastQuery(filters);
    await fetchPlanograms({ pageIndex: 0, pageSize: rowsPerPage, filters });
  };

  const handleSave = async (event) => {
    event?.preventDefault?.();
    setFormFeedback(null);

    const normalizedInternalId =
      padInternalId(formValues.internalId.trim()) ||
      padInternalId(internalIdInput.trim());
    const autoSifra =
      formValues.sifraArt?.trim() ||
      formValues.internalId.trim() ||
      internalIdInput.trim();

    const payload = {
      internalId: normalizedInternalId,
      sifraArt: autoSifra,
      moduleId: formValues.moduleId.trim(),
      x: normalizeNumber(formValues.x),
      y: normalizeNumber(formValues.y),
      z: normalizeNumber(formValues.z),
      planogramId: formValues.planogramId.trim(),
    };

    if (!payload.internalId) {
      setFormFeedback({
        severity: "warning",
        message: "Internal ID is required.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await API.post("/planograms", payload);
      const saved = res.data?.planogram ?? payload;
      setPlanograms((prev) => {
        const exists = prev.some(
          (item) =>
            item.internalId === saved.internalId &&
            item.sifraArt === saved.sifraArt
        );
        if (exists) {
          return prev.map((item) =>
            item.internalId === saved.internalId &&
            item.sifraArt === saved.sifraArt
              ? { ...item, ...saved }
              : item
          );
        }
        return [...prev, saved];
      });
      setSelectedKey({
        internalId: saved.internalId,
        sifraArt: saved.sifraArt,
      });
      setFormFeedback({
        severity: "success",
        message: "Planogram layout saved.",
      });
    } catch (error) {
      setFormFeedback({
        severity: "error",
        message: "Unable to save this layout. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSelect = (planogram) => {
    setSelectedKey({
      internalId: planogram.internalId,
      sifraArt: planogram.sifraArt,
    });
    setFormValues({
      internalId: planogram.internalId ?? "",
      moduleId: planogram.moduleId ?? "",
      planogramId: planogram.planogramId ?? "",
      x: planogram.x ?? "",
      y: planogram.y ?? "",
      z: planogram.z ?? "",
    });
    setFormFeedback(null);
    setPhotoFeedback(null);
  };

  const handleDelete = async (planogram) => {
    const confirmed = window.confirm(
      `Delete layout ${planogram.sifraArt} for internal ID ${planogram.internalId}?`
    );
    if (!confirmed) {
      return;
    }

    try {
      await API.delete(
        `/planograms/${encodeURIComponent(planogram.internalId)}/${encodeURIComponent(planogram.sifraArt)}`
      );
      setPlanograms((prev) =>
        prev.filter(
          (item) =>
            !(
              item.internalId === planogram.internalId &&
              item.sifraArt === planogram.sifraArt
            )
        )
      );
      if (
        selectedKey &&
        selectedKey.internalId === planogram.internalId &&
        selectedKey.sifraArt === planogram.sifraArt
      ) {
        setSelectedKey(null);
        resetForm(internalIdInput.trim(), planogramIdFilter.trim());
      }
      setFormFeedback({
        severity: "success",
        message: "Layout deleted.",
      });
    } catch (error) {
      setFormFeedback({
        severity: "error",
        message: "Unable to delete this layout. Please try again.",
      });
    }
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setPhotoFeedback(null);

    if (!selectedPlanogram) {
      setPhotoFeedback({
        severity: "warning",
        message: "Select a layout first to attach a photo.",
      });
      return;
    }

    if (!file) {
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);

      const res = await API.post(
        `/planograms/${encodeURIComponent(selectedPlanogram.internalId)}/${encodeURIComponent(selectedPlanogram.sifraArt)}/photo`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const saved = res.data?.planogram;
      if (saved) {
        setPlanograms((prev) =>
          prev.map((item) =>
            item.internalId === saved.internalId &&
            item.sifraArt === saved.sifraArt
              ? { ...item, ...saved }
              : item
          )
        );
      }
      setPhotoFeedback({
        severity: "success",
        message: "Photo uploaded successfully.",
      });
    } catch (error) {
      setPhotoFeedback({
        severity: "error",
        message: "We couldn't upload that photo. Please try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  const loadPhotoFiles = async () => {
    setPhotoFilesLoading(true);
    setPhotoFeedback(null);
    try {
      const res = await API.get("/planograms/photos");
      const files = Array.isArray(res.data?.files) ? res.data.files : [];
      setPhotoFiles(files);
    } catch (error) {
      setPhotoFeedback({
        severity: "error",
        message: "Unable to list existing photos.",
      });
    } finally {
      setPhotoFilesLoading(false);
    }
  };

  const handleLinkExistingPhoto = async () => {
    if (!selectedPlanogram) {
      setPhotoFeedback({
        severity: "warning",
        message: "Select a layout first to attach a photo.",
      });
      return;
    }
    if (!selectedExistingFile) {
      setPhotoFeedback({
        severity: "warning",
        message: "Choose a filename from the list before linking.",
      });
      return;
    }

    setUploading(true);
    setPhotoFeedback(null);
    try {
      const res = await API.post(
        `/planograms/${encodeURIComponent(selectedPlanogram.internalId)}/${encodeURIComponent(selectedPlanogram.sifraArt)}/photo/link`,
        { filename: selectedExistingFile }
      );
      const saved = res.data?.planogram;
      if (saved) {
        setPlanograms((prev) =>
          prev.map((item) =>
            item.internalId === saved.internalId &&
            item.sifraArt === saved.sifraArt
              ? { ...item, ...saved }
              : item
          )
        );
      }
      setPhotoFeedback({
        severity: "success",
        message: "Existing photo linked successfully.",
      });
    } catch (error) {
      setPhotoFeedback({
        severity: "error",
        message: "Unable to link that photo. Confirm the filename exists.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handlePageChange = async (_event, newPage) => {
    setPage(newPage);
    await fetchPlanograms({ pageIndex: newPage });
  };

  const handleRowsPerPageChange = async (event) => {
    const next = parseInt(event.target.value, 10);
    setRowsPerPage(next);
    setPage(0);
    await fetchPlanograms({ pageIndex: 0, pageSize: next });
  };

  const photoSrc = useMemo(() => {
    if (!selectedPlanogram?.photoUrl) {
      return null;
    }
    if (selectedPlanogram.photoUrl.startsWith("http")) {
      return selectedPlanogram.photoUrl;
    }
    const base = backendBaseUrl.replace(/\/+$/, "");
    const path =
      selectedPlanogram.photoUrl.startsWith("/")
        ? selectedPlanogram.photoUrl
        : `/${selectedPlanogram.photoUrl}`;
    return `${base}${path}`;
  }, [backendBaseUrl, selectedPlanogram]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: (theme) => theme.palette.background.default,
      }}
    >
      <PageHero
        title="Planogram workspace"
        subtitle="Search, edit and enrich shelf planograms by Internal ID. Upload reference photos so teams can verify placement in the aisle."
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
          <NotificationMenu
            key="notifications"
            onUnreadChange={setUnreadNotifications}
            onLoadingChange={setNotificationsLoading}
          />,
          <Button
            key="change-password"
            variant="outlined"
            color="inherit"
            component={RouterLink}
            to="/change-password"
          >
            Change password
          </Button>,
          <Button
            key="logout"
            variant="contained"
            color="secondary"
            onClick={logout}
          >
            Logout
          </Button>,
        ]}
      >
        <Stack spacing={1.5}>
          <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>
            Planogram coverage
          </Typography>
          <Typography variant="body1">
            Keep module assignments and coordinates aligned with the shelf
            layout. Attach a quick reference photo so merchandisers can verify
            setup in store.
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              color="primary"
              label={`Unread notifications: ${
                notificationsLoading ? "..." : unreadNotifications
              }`}
            />
            {planograms.length > 0 && (
              <Chip
                color="secondary"
                label={`Loaded layouts: ${planograms.length}`}
              />
            )}
          </Stack>
        </Stack>
      </PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>
          <SectionCard
            title="Lookup planogram layouts"
            description="Retrieve records by Internal ID, Planogram code, Module, or missing data."
            action={
              <Button
                variant="outlined"
                startIcon={<RefreshRoundedIcon />}
                onClick={() => resetForm(internalIdInput.trim(), planogramIdFilter.trim())}
              >
                New entry
              </Button>
            }
          >
            <Box component="form" onSubmit={handleSearch}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Internal ID"
                    value={internalIdInput}
                    onChange={(event) => setInternalIdInput(event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Planogram code (optional)"
                    value={planogramIdFilter}
                    onChange={(event) =>
                      setPlanogramIdFilter(event.target.value)
                    }
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Module (optional)"
                    value={moduleFilter}
                    onChange={(event) => setModuleFilter(event.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={missingXyzFilter}
                          onChange={(event) =>
                            setMissingXyzFilter(event.target.checked)
                          }
                        />
                      }
                      label="Missing XYZ"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={missingPhotoFilter}
                          onChange={(event) =>
                            setMissingPhotoFilter(event.target.checked)
                          }
                        />
                      }
                      label="Missing photo"
                    />
                  </Stack>
                </Grid>
                <Grid
                  item
                  xs={12}
                  md={4}
                  sx={{ display: "flex", gap: 1, alignItems: "center" }}
                >
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={
                      loading ? <CircularProgress size={20} /> : <SearchRoundedIcon />
                    }
                    disabled={loading}
                    fullWidth
                  >
                    Search
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => {
                      setInternalIdInput("");
                      setPlanogramIdFilter("");
                      setModuleFilter("");
                      setMissingXyzFilter(false);
                      setMissingPhotoFilter(false);
                      setPlanograms([]);
                      setTotalPlanograms(0);
                      setPage(0);
                      setLastQuery(null);
                      resetForm();
                      setLookupFeedback(null);
                    }}
                    fullWidth
                  >
                    Clear
                  </Button>
                </Grid>
              </Grid>
            </Box>
            {lookupFeedback && (
              <Alert
                severity={lookupFeedback.severity}
                sx={{ mt: 2 }}
                onClose={() => setLookupFeedback(null)}
              >
                {lookupFeedback.message}
              </Alert>
            )}
          </SectionCard>

          <SectionCard
            title="Matching layouts"
            description="Click a row to edit coordinates or manage its photo."
          >
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Sifra Art</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Planogram</TableCell>
                    <TableCell>Module</TableCell>
                    <TableCell>X</TableCell>
                    <TableCell>Y</TableCell>
                    <TableCell>Z</TableCell>
                    <TableCell>Photo</TableCell>
                    <TableCell>Filename</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {planograms.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10}>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          align="center"
                        >
                          No layouts loaded yet. Search by Internal ID to get
                          started.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {planograms.map((planogram) => {
                    const isSelected =
                      selectedPlanogram &&
                      selectedPlanogram.internalId === planogram.internalId &&
                      selectedPlanogram.sifraArt === planogram.sifraArt;
                    return (
                      <TableRow
                        key={`${planogram.internalId}-${planogram.sifraArt}`}
                        hover
                        selected={isSelected}
                        onClick={() => handleEditSelect(planogram)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>{planogram.sifraArt}</TableCell>
                        <TableCell>
                          {planogram.articleName || (
                            <Typography variant="caption" color="text.secondary">
                              (no name)
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {planogram.planogramId ? (
                            <Chip
                              size="small"
                              label={planogram.planogramId}
                              color="primary"
                              variant="outlined"
                            />
                          ) : (
                            <Chip size="small" label="N/A" />
                          )}
                        </TableCell>
                        <TableCell>{planogram.moduleId || "—"}</TableCell>
                        <TableCell>{formatDecimal(planogram.x)}</TableCell>
                        <TableCell>{formatDecimal(planogram.y)}</TableCell>
                        <TableCell>{formatDecimal(planogram.z)}</TableCell>
                        <TableCell>
                          {planogram.photoUrl ? (
                            <Chip
                              label="Photo"
                              color="success"
                              size="small"
                              variant="outlined"
                            />
                          ) : (
                            <Chip label="Missing" size="small" />
                          )}
                        </TableCell>
                        <TableCell>
                          {planogram.photoOriginalName ||
                            extractFileName(planogram.photoUrl) || (
                              <Typography variant="caption" color="text.secondary">
                                (not uploaded)
                              </Typography>
                            )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Edit row">
                            <IconButton
                              size="small"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEditSelect(planogram);
                              }}
                            >
                              <EditRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Upload photo">
                            <IconButton
                              size="small"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEditSelect(planogram);
                                document
                                  .getElementById("planogram-photo-input")
                                  ?.click();
                              }}
                            >
                              <CloudUploadRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete layout">
                            <IconButton
                              size="small"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDelete(planogram);
                              }}
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={totalPlanograms}
                page={page}
                onPageChange={handlePageChange}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleRowsPerPageChange}
                rowsPerPageOptions={[10, 25, 50, 100]}
              />
            </TableContainer>
          </SectionCard>

          <SectionCard
            title="Edit or add a layout"
            description="Save module, coordinates and photo for a specific Internal ID + Sifra Art combination."
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={7}>
                <Stack
                  component="form"
                  spacing={2}
                  onSubmit={handleSave}
                  noValidate
                >
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Internal ID"
                        value={formValues.internalId}
                        onChange={(event) =>
                          setFormValue("internalId", event.target.value)
                        }
                        required
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Planogram ID"
                        value={formValues.planogramId}
                        onChange={(event) =>
                          setFormValue("planogramId", event.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Module ID"
                        value={formValues.moduleId}
                        onChange={(event) =>
                          setFormValue("moduleId", event.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="X"
                        type="number"
                        inputProps={{ step: "0.01" }}
                        value={formValues.x}
                        onChange={(event) =>
                          setFormValue("x", event.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Y"
                        type="number"
                        inputProps={{ step: "0.01" }}
                        value={formValues.y}
                        onChange={(event) =>
                          setFormValue("y", event.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="Z"
                        type="number"
                        inputProps={{ step: "0.01" }}
                        value={formValues.z}
                        onChange={(event) =>
                          setFormValue("z", event.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                  </Grid>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {selectedPlanogram && (
                      <Chip
                        color="primary"
                        label={`Editing ${selectedPlanogram.sifraArt}`}
                      />
                    )}
                    <Chip
                      label="Fields marked * are required"
                      color="info"
                      variant="outlined"
                    />
                  </Stack>

                  {formFeedback && (
                    <Alert
                      severity={formFeedback.severity}
                      onClose={() => setFormFeedback(null)}
                    >
                      {formFeedback.message}
                    </Alert>
                  )}

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      type="submit"
                      variant="contained"
                      startIcon={
                        saving ? <CircularProgress size={20} /> : <EditRoundedIcon />
                      }
                      disabled={saving}
                    >
                      Save layout
                    </Button>
                    <Button
                      variant="text"
                      onClick={() =>
                        resetForm(internalIdInput.trim(), planogramIdFilter.trim())
                      }
                    >
                      Reset form
                    </Button>
                  </Stack>
                </Stack>
              </Grid>

              <Grid item xs={12} md={5}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="h6">Layout photo</Typography>
                    <Chip
                      size="small"
                      color={photoSrc ? "success" : "default"}
                      label={photoSrc ? "Attached" : "Missing"}
                    />
                  </Stack>

                  {selectedPlanogram?.photoOriginalName && (
                    <Typography variant="body2" color="text.secondary">
                      File: {selectedPlanogram.photoOriginalName}
                    </Typography>
                  )}

                  {photoFeedback && (
                    <Alert
                      severity={photoFeedback.severity}
                      onClose={() => setPhotoFeedback(null)}
                    >
                      {photoFeedback.message}
                    </Alert>
                  )}

                  {photoSrc ? (
                    <Box
                      sx={{
                        borderRadius: 2,
                        overflow: "hidden",
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <img
                        src={photoSrc}
                        alt="Planogram reference"
                        style={{
                          width: "100%",
                          maxWidth: 300,
                          maxHeight: 300,
                          display: "block",
                          objectFit: "contain",
                          margin: "0 auto",
                        }}
                      />
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        flexGrow: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: (theme) => `1px dashed ${theme.palette.divider}`,
                        borderRadius: 2,
                        p: 3,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Select a layout row to view or upload its reference photo.
                      </Typography>
                    </Box>
                  )}

                  <Divider />

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      variant="outlined"
                      startIcon={<PhotoCameraBackRoundedIcon />}
                      component="label"
                      disabled={!selectedPlanogram || uploading}
                    >
                      {uploading ? "Uploading..." : "Upload / replace photo"}
                      <input
                        id="planogram-photo-input"
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handlePhotoUpload}
                      />
                    </Button>
                    {photoSrc && (
                      <Button
                        variant="text"
                        href={photoSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in new tab
                      </Button>
                    )}
                  </Stack>

                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FormControl size="small" fullWidth>
                        <InputLabel id="existing-photo-label">Existing photo</InputLabel>
                        <Select
                          labelId="existing-photo-label"
                          label="Existing photo"
                          value={selectedExistingFile}
                          onChange={(event) => setSelectedExistingFile(event.target.value)}
                          disabled={photoFilesLoading || uploading}
                        >
                          {photoFiles.map((file) => (
                            <MenuItem key={file} value={file}>
                              {file}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button
                        variant="outlined"
                        onClick={loadPhotoFiles}
                        disabled={photoFilesLoading}
                      >
                        {photoFilesLoading ? "Loading..." : "Refresh"}
                      </Button>
                    </Stack>
                    <Button
                      variant="contained"
                      color="secondary"
                      onClick={handleLinkExistingPhoto}
                      disabled={!selectedPlanogram || uploading}
                    >
                      {uploading ? "Linking..." : "Link existing photo"}
                    </Button>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </SectionCard>
        </Stack>
      </Container>
    </Box>
  );
}
