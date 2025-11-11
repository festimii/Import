import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Container,
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
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import API from "../api";
import formatArticleCode, { formatArticleLabel } from "../utils/formatArticle";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";
import SectionCard from "../components/SectionCard";
import NotificationPermissionBanner from "../components/NotificationPermissionBanner";
import NotificationCenter from "../components/NotificationCenter";

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

export default function RequesterDashboard() {
  const currentDate = today();
  const [importer, setImporter] = useState("");
  const [items, setItems] = useState([{ article: "", boxCount: "" }]);
  const [arrivalDate, setArrivalDate] = useState("");
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submissionDetails, setSubmissionDetails] = useState(null);
  const notificationCenterRef = useRef(null);
  const excelInputRef = useRef(null);
  const [excelFiles, setExcelFiles] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showAdvancedTotals, setShowAdvancedTotals] = useState(false);
  const [showItemBreakdown, setShowItemBreakdown] = useState(false);

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

    const hasExcelFiles = excelFiles.length > 0;
    const importerValue = importer.trim();

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

    try {
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
        excelFiles.forEach((file) => formData.append("files", file, file.name));
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
    } catch (error) {
      setFeedback({
        severity: "error",
        message:
          error.response?.data?.message ||
          "Something went wrong while creating the order.",
      });
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
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHero
        title="Stock Menagment"
        subtitle=""
        actions={
          <Button variant="contained" color="secondary" onClick={logout}>
            Logout
          </Button>
        }
      ></PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>
          <SectionCard title="" description="">
            <Stack spacing={2}>
              <NotificationPermissionBanner
                onEnabled={() => notificationCenterRef.current?.reload()}
              />
              <NotificationCenter
                ref={notificationCenterRef}
                onUnreadCountChange={setUnreadNotifications}
                onLoadingChange={setNotificationsLoading}
                description=""
                emptyMessage="You're up to date with the latest changes."
              />
            </Stack>
          </SectionCard>

          <SectionCard
            title="Krijo porosi te re"
            description="Vendos detajet e porosise se importit per te filluar procesin e palletizimit dhe planifikimit te ardhjes."
          >
            <Stack spacing={4}>
              {feedback && (
                <Alert severity={feedback.severity}>{feedback.message}</Alert>
              )}

              <Box component="form" onSubmit={handleSubmit} noValidate>
                <Stack spacing={3}>
                  <TextField
                    label="Data Krijimit"
                    type="date"
                    value={currentDate}
                    disabled
                    InputLabelProps={{ shrink: true }}
                    helperText=""
                    required
                    fullWidth
                  />
                  <TextField
                    label="Furnitori"
                    value={importer}
                    onChange={(event) => setImporter(event.target.value)}
                    placeholder="Furnitori i importit"
                    required
                    fullWidth
                  />
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
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">
                      Artikujt e porosise
                    </Typography>
                    {items.map((item, index) => (
                      <Stack
                        key={`order-item-${index}`}
                        spacing={2}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: "divider",
                          backgroundColor: "background.paper",
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Typography variant="subtitle2">
                            Artikulli {index + 1}
                          </Typography>
                          {items.length > 1 && (
                            <Button
                              type="button"
                              color="error"
                              onClick={() => handleRemoveItem(index)}
                              size="small"
                            >
                              Remove
                            </Button>
                          )}
                        </Stack>
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
                          placeholder=""
                          helperText="Artikulli qe ka me pak se 6 karaktere automatikisht i shtohen zero para tij"
                          required
                          fullWidth
                        />
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
                          helperText="Kalkulimi behet ne baze te sasis se pakove automatikisht"
                          required
                          fullWidth
                        />
                      </Stack>
                    ))}
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={handleAddItem}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Shto artikull tjeter
                    </Button>
                  </Stack>
                  <Stack spacing={1}>
                    <Typography variant="subtitle1">
                      Import nga Excel (optional)
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Vendosni exelin me te dhenat e artikujve per import
                      automatik, nese zgjidhni kete opsion, fushat e artikujve
                      me lart do te injorohen!
                    </Typography>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2}
                      alignItems={{ sm: "center" }}
                    >
                      <Button component="label" variant="outlined">
                        Select Excel files
                        <input
                          type="file"
                          hidden
                          multiple
                          accept=".xlsx,.xls"
                          ref={excelInputRef}
                          onChange={handleExcelChange}
                        />
                      </Button>
                      {excelFiles.length > 0 && (
                        <Button
                          type="button"
                          color="secondary"
                          onClick={handleExcelClear}
                        >
                          Anulo Exelin
                        </Button>
                      )}
                    </Stack>
                    {excelFiles.length > 0 && (
                      <Stack spacing={0.5}>
                        {excelFiles.map((file, index) => (
                          <Typography
                            key={`${file.name}-${index}`}
                            variant="body2"
                          >
                            {file.name}
                          </Typography>
                        ))}
                        <Typography variant="caption" color="text.secondary">
                          {`Manual entries are ignored while ${
                            excelFiles.length
                          } file${
                            excelFiles.length === 1 ? "" : "s"
                          } are attached.`}
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                  <TextField
                    label="Vendos koment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Shto nje koment te perbashket per porosine"
                    helperText="Vendos nje koment te perbashket per porosine"
                    multiline
                    minRows={3}
                    fullWidth
                  />

                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button type="submit" variant="contained" size="large">
                      Submit order
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </SectionCard>

          <CalendarOverview
            title="Calendari i Arritjeve te Konfirmuara"
            description=" "
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
    </Box>
  );
}
