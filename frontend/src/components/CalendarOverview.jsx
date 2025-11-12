import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { PickersDay } from "@mui/x-date-pickers/PickersDay";
import { alpha } from "@mui/material/styles";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import Diversity3Icon from "@mui/icons-material/Diversity3";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import { format } from "date-fns";
import API from "../api";
import { formatArticleLabel } from "../utils/formatArticle";

const formatKey = (date) => format(date, "yyyy-MM-dd");

const formatNumeric = (value, fractionDigits = 0) => {
  if (value === null || value === undefined) return "N/A";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "N/A";
  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

const formatPercent = (value, fractionDigits = 1) => {
  if (value === null || value === undefined) return "N/A";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "N/A";
  return `${numericValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
};

const LIST_PREVIEW_LIMIT = 6;
const CARD_MIN_WIDTH = 320;

const BASE_CHIP_STYLES = {
  height: "auto",
  minHeight: 32,
  alignItems: "flex-start",
  justifyContent: "flex-start",
  whiteSpace: "normal",
  lineHeight: 1.25,
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  textAlign: "left",
  px: 1,
  py: 0.25,
  boxSizing: "border-box",
};

const FULL_WIDTH_CHIP_STYLES = {
  ...BASE_CHIP_STYLES,
  width: "100%",
  maxWidth: "100%",
};

const BATCH_SUM_FIELDS = [
  "BoxCount",
  "PalletCount",
  "FullPallets",
  "RemainingBoxes",
  "WeightFullPalletsKg",
  "VolumeFullPalletsM3",
  "WeightRemainingKg",
  "VolumeRemainingM3",
  "TotalShipmentWeightKg",
  "TotalShipmentVolumeM3",
];

const toNumberOrZero = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
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

const aggregateConfirmedRequestsByBatch = (requests = []) => {
  const groups = new Map();

  requests.forEach((request, index) => {
    if (!request) return;

    const batchKey = request.BatchId ?? `legacy-${request.ID ?? index}`;
    const arrivalKey = request.ArrivalDate ?? "unknown-arrival";
    const compositeKey = `${batchKey}__${arrivalKey}`;

    if (!groups.has(compositeKey)) {
      groups.set(compositeKey, {
        key: compositeKey,
        batchId: request.BatchId ?? null,
        primaryId: request.BatchId ?? request.ID ?? compositeKey,
        arrivalDate: request.ArrivalDate ?? null,
        earliestRequestDate: request.RequestDate ?? null,
        importerSet: new Set(),
        confirmedBySet: new Set(),
        commentSet: new Set(),
        articles: [],
        totals: BATCH_SUM_FIELDS.reduce((acc, field) => {
          acc[field] = 0;
          return acc;
        }, {}),
        utilizationTotal: 0,
        utilizationCount: 0,
        requestIds: [],
      });
    }

    const group = groups.get(compositeKey);
    if (request.Importer) {
      group.importerSet.add(request.Importer);
    }
    if (request.ConfirmedBy) {
      group.confirmedBySet.add(request.ConfirmedBy);
    }
    if (request.Comment) {
      group.commentSet.add(request.Comment);
    }

    group.articles.push({
      article: request.Article,
      articleName: request.ArticleName,
    });

    if (request.ID) {
      group.requestIds.push(request.ID);
    }

    BATCH_SUM_FIELDS.forEach((field) => {
      group.totals[field] += toNumberOrZero(request[field]);
    });

    const utilizationValue = Number(request.PalletVolumeUtilization);
    if (Number.isFinite(utilizationValue)) {
      group.utilizationTotal += utilizationValue;
      group.utilizationCount += 1;
    }

    group.earliestRequestDate = pickEarlierDateValue(
      group.earliestRequestDate,
      request.RequestDate
    );

    if (!group.arrivalDate && request.ArrivalDate) {
      group.arrivalDate = request.ArrivalDate;
    }
  });

  return Array.from(groups.values()).map((group) => {
    const importers = Array.from(group.importerSet).filter(Boolean);
    const confirmedBy = Array.from(group.confirmedBySet).filter(Boolean);
    const comments = Array.from(group.commentSet).filter(Boolean);
    const importerList =
      importers.length > 0 ? importers : ["Unknown importer"];

    return {
      ID: group.primaryId,
      BatchKey: group.key,
      BatchId: group.batchId,
      ArrivalDate: group.arrivalDate,
      RequestDate: group.earliestRequestDate,
      Importer:
        importerList.length === 1
          ? importerList[0]
          : `${importerList[0]} + ${importerList.length - 1} more`,
      ImporterList: importerList,
      ArticleDetails: group.articles,
      ArticleCount: group.articles.length,
      ...group.totals,
      PalletVolumeUtilization:
        group.utilizationCount > 0
          ? group.utilizationTotal / group.utilizationCount
          : null,
      ConfirmedBy: confirmedBy.join(", ") || null,
      ConfirmedByList: confirmedBy,
      Comment: comments.join("\n") || null,
      RequestIds: group.requestIds,
    };
  });
};

const summarizeArticles = (articles) => {
  if (!Array.isArray(articles) || articles.length === 0) {
    return "No articles";
  }
  const [first, ...rest] = articles;
  const baseLabel = formatArticleLabel(first.article, first.articleName);
  if (rest.length === 0) {
    return baseLabel;
  }
  return `${baseLabel} + ${rest.length} more`;
};

const formatArticlesDetail = (articles) => {
  if (!Array.isArray(articles) || articles.length === 0) {
    return null;
  }
  const labels = articles
    .map((item) => formatArticleLabel(item.article, item.articleName))
    .filter(Boolean);
  if (labels.length === 0) {
    return null;
  }
  return `Articles: ${labels.join(", ")}`;
};

const formatBatchCode = (batchId) => {
  if (!batchId || typeof batchId !== "string") {
    return null;
  }
  return batchId.slice(0, 8).toUpperCase();
};

const CalendarOverview = ({
  title = "Confirmed arrivals overview",
  description,
  sx,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [confirmedRequests, setConfirmedRequests] = useState([]);
  const [wmsOrders, setWmsOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState({});
  const [showAllConfirmed, setShowAllConfirmed] = useState(false);
  const [showAllWms, setShowAllWms] = useState(false);
  const confirmedBatches = useMemo(
    () => aggregateConfirmedRequestsByBatch(confirmedRequests),
    [confirmedRequests]
  );
  const loadRequests = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await API.get("/imports/calendar");
      const confirmed = Array.isArray(res.data?.confirmedImports)
        ? res.data.confirmedImports
        : [];
      const wms = Array.isArray(res.data?.wmsOrders) ? res.data.wmsOrders : [];
      setConfirmedRequests(confirmed);
      setWmsOrders(wms);
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "We couldn't load calendar data. Please retry shortly.",
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadRequests();
    const refreshHandle = setInterval(() => {
      loadRequests();
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(refreshHandle);
    };
  }, [loadRequests]);
  useEffect(() => {
    setShowAllConfirmed(false);
    setShowAllWms(false);
  }, [selectedDate]);
  const toggleExpanded = useCallback((key) => {
    setExpandedKeys((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }, []);
  const isExpanded = useCallback(
    (key) => Boolean(expandedKeys[key]),
    [expandedKeys]
  );
  const confirmedByDate = useMemo(() => {
    const grouped = new Map();
    confirmedBatches.forEach((request) => {
      if (!request.ArrivalDate) return;
      const parsed = new Date(request.ArrivalDate);
      if (Number.isNaN(parsed.getTime())) {
        return;
      }
      const key = formatKey(parsed);
      const events = grouped.get(key) ?? [];
      events.push(request);
      grouped.set(key, events);
    });
    return grouped;
  }, [confirmedBatches]);
  const wmsByDate = useMemo(() => {
    const grouped = new Map();
    wmsOrders.forEach((order) => {
      if (!order.ArrivalDate) return;
      const parsed = new Date(order.ArrivalDate);
      if (Number.isNaN(parsed.getTime())) {
        return;
      }
      const key = formatKey(parsed);
      const events = grouped.get(key) ?? [];
      events.push(order);
      grouped.set(key, events);
    });
    return grouped;
  }, [wmsOrders]);
  const eventsForSelectedDate = useMemo(() => {
    if (
      !(selectedDate instanceof Date) ||
      Number.isNaN(selectedDate.getTime())
    ) {
      return { confirmed: [], wms: [] };
    }
    const key = formatKey(selectedDate);
    return {
      confirmed: confirmedByDate.get(key) ?? [],
      wms: wmsByDate.get(key) ?? [],
    };
  }, [confirmedByDate, selectedDate, wmsByDate]);
  const hasWmsArrivals = eventsForSelectedDate.wms.length > 0;
  const hasConfirmedArrivals = eventsForSelectedDate.confirmed.length > 0;
  const hasEventsForSelectedDate = hasWmsArrivals || hasConfirmedArrivals;
  const confirmedVisible = useMemo(() => {
    const items = eventsForSelectedDate.confirmed ?? [];
    if (showAllConfirmed || items.length <= LIST_PREVIEW_LIMIT) {
      return items;
    }
    return items.slice(0, LIST_PREVIEW_LIMIT);
  }, [eventsForSelectedDate, showAllConfirmed]);
  const wmsVisible = useMemo(() => {
    const items = eventsForSelectedDate.wms ?? [];
    if (showAllWms || items.length <= LIST_PREVIEW_LIMIT) {
      return items;
    }
    return items.slice(0, LIST_PREVIEW_LIMIT);
  }, [eventsForSelectedDate, showAllWms]);
  const formattedSelectedDate = useMemo(() => {
    if (
      !(selectedDate instanceof Date) ||
      Number.isNaN(selectedDate.getTime())
    ) {
      return "Select a date";
    }
    return format(selectedDate, "MMMM d, yyyy");
  }, [selectedDate]);
  const selectedAggregates = useMemo(() => {
    const confirmed = eventsForSelectedDate.confirmed ?? [];
    const wms = eventsForSelectedDate.wms ?? [];
    const combined = [...confirmed, ...wms];
    const sumField = (collection, field) =>
      collection.reduce((acc, item) => {
        const value = Number(item[field]);
        return Number.isFinite(value) ? acc + value : acc;
      }, 0);
    const confirmedPallets = sumField(confirmed, "PalletCount");
    const wmsPallets = sumField(wms, "PalletCount");
    const uniqueImporters = new Set(
      combined.flatMap((item) => {
        if (Array.isArray(item.ImporterList) && item.ImporterList.length > 0) {
          return item.ImporterList;
        }
        if (item.Importer) {
          return [item.Importer];
        }
        return [];
      })
    );
    return {
      combinedCount: combined.length,
      confirmedCount: confirmed.length,
      wmsCount: wms.length,
      totalPallets: confirmedPallets + wmsPallets,
      uniqueImporters: uniqueImporters.size,
      breakdown: {
        pallets: {
          confirmed: confirmedPallets,
          wms: wmsPallets,
        },
      },
    };
  }, [eventsForSelectedDate]);
  const quickStats = useMemo(() => {
    const stats = [
      {
        key: "selected-date",
        label: "Selected date",
        value: formattedSelectedDate,
        caption: selectedAggregates.combinedCount
          ? `Showing ${selectedAggregates.combinedCount} arrival${
              selectedAggregates.combinedCount === 1 ? "" : "s"
            }`
          : "No arrivals scheduled",
        icon: CalendarMonthIcon,
      },
    ];

    if (selectedAggregates.combinedCount > 0) {
      stats.push({
        key: "arrivals",
        label: "Arrivals",
        value: formatNumeric(selectedAggregates.combinedCount),
        caption: "Imports + WMS",
        icon: LocalShippingIcon,
        segments: [
          {
            key: "arrivals-imports",
            label: "Imports",
            value: formatNumeric(selectedAggregates.confirmedCount),
            color: "success.main",
          },
          {
            key: "arrivals-wms",
            label: "WMS",
            value: formatNumeric(selectedAggregates.wmsCount),
            color: "error.main",
          },
        ],
      });
    }

    if (selectedAggregates.totalPallets > 0) {
      stats.push({
        key: "total-pallets",
        label: "Total pallets",
        value: formatNumeric(selectedAggregates.totalPallets),
        caption: "Imports + WMS",
        icon: ViewInArIcon,
        segments: [
          {
            key: "pallets-imports",
            label: "Imports",
            value: formatNumeric(
              selectedAggregates.breakdown.pallets.confirmed
            ),
            color: "success.main",
          },
          {
            key: "pallets-wms",
            label: "WMS",
            value: formatNumeric(selectedAggregates.breakdown.pallets.wms),
            color: "error.main",
          },
        ],
      });
    }

    return stats;
  }, [formattedSelectedDate, selectedAggregates]);
  const renderDay = (dayProps) => {
    const { day, selectedDay, outsideCurrentMonth } = dayProps;
    if (!(day instanceof Date) || Number.isNaN(day.getTime())) {
      return <PickersDay {...dayProps} />;
    }
    if (outsideCurrentMonth) {
      return <PickersDay {...dayProps} />;
    }
    const key = formatKey(day);
    const confirmedEvents = confirmedByDate.get(key) ?? [];
    const wmsEvents = wmsByDate.get(key) ?? [];
    const confirmedCount = confirmedEvents.length;
    const wmsCount = wmsEvents.length;
    const hasConfirmed = confirmedCount > 0;
    const hasWms = wmsCount > 0;
    let dayNode = (
      <PickersDay
        {...dayProps}
        selected={selectedDay}
        outsideCurrentMonth={outsideCurrentMonth}
        sx={{
          borderRadius: "14px",
          border: (theme) => {
            if (hasWms) {
              return `1px solid ${alpha(theme.palette.error.main, 0.6)}`;
            }
            if (hasConfirmed) {
              return `1px solid ${alpha(theme.palette.success.main, 0.5)}`;
            }
            return undefined;
          },
          backgroundColor: (theme) => {
            if (hasWms && hasConfirmed) {
              return alpha(theme.palette.warning.main, 0.15);
            }
            if (hasWms) {
              return alpha(theme.palette.error.main, 0.1);
            }
            if (hasConfirmed) {
              return alpha(theme.palette.success.main, 0.12);
            }
            return undefined;
          },
        }}
      />
    );
    if (hasWms) {
      dayNode = (
        <Badge
          overlap="circular"
          color="error"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          badgeContent={wmsCount}
          sx={{
            "& .MuiBadge-badge": {
              fontSize: 11,
              height: 20,
              minWidth: 20,
            },
          }}
        >
          {dayNode}
        </Badge>
      );
    }
    if (hasConfirmed) {
      dayNode = (
        <Badge
          overlap="circular"
          color="success"
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          badgeContent={confirmedCount}
          sx={{
            "& .MuiBadge-badge": {
              fontSize: 11,
              height: 20,
              minWidth: 20,
            },
          }}
        >
          {dayNode}
        </Badge>
      );
    }
    return dayNode;
  };
  const renderDetailRows = (details, options = {}) => {
    const { commentLabel = "Note" } = options;
    const detailItems = Array.isArray(details) ? details.filter(Boolean) : [];
    const hasComment = Boolean(options.comment);
    if (detailItems.length === 0 && !hasComment) {
      return null;
    }
    return (
      <Stack spacing={0.75} sx={{ mt: 0.5 }}>
        {detailItems.length > 0 && (
          <Stack
            direction="row"
            spacing={0.5}
            flexWrap="wrap"
            useFlexGap
            sx={{ rowGap: 0.5, columnGap: 0.5 }}
          >
            {detailItems.map((detail, index) => (
              <Chip
                key={`${detail}-${index}`}
                label={detail}
                size="small"
                variant="outlined"
                sx={BASE_CHIP_STYLES}
              />
            ))}
          </Stack>
        )}
        {hasComment && (
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", whiteSpace: "pre-wrap" }}
          >
            {commentLabel}: {options.comment}
          </Typography>
        )}
      </Stack>
    );
  };
  return (
    <Paper
      elevation={12}
      sx={{
        p: { xs: 3, md: 5 },
        borderRadius: 4,
        background: (theme) =>
          `linear-gradient(160deg, ${
            theme.palette.background.paper
          } 0%, ${alpha(theme.palette.primary.main, 0.06)} 100%)`,
        border: (theme) =>
          `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
        ...(sx ?? {}),
      }}
    >
      <Stack spacing={4}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>
        {quickStats.length > 0 && (
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "repeat(auto-fit, minmax(160px, 1fr))",
              },
            }}
          >
            {quickStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Box
                  key={stat.key ?? stat.label}
                  sx={{
                    p: 3,
                    borderRadius: 4,
                    border: (theme) =>
                      `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                    background: (theme) =>
                      `linear-gradient(150deg, ${alpha(
                        theme.palette.primary.light,
                        0.12
                      )} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
                    boxShadow: (theme) =>
                      `0 18px 38px ${alpha(theme.palette.primary.main, 0.12)}`,
                    minHeight: 170,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                  }}
                >
                  {Icon && (
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: (theme) =>
                          alpha(theme.palette.primary.main, 0.12),
                        color: "primary.main",
                      }}
                    >
                      <Icon fontSize="medium" />
                    </Box>
                  )}
                  <Typography
                    variant="overline"
                    sx={{ letterSpacing: 1.2, color: "text.secondary" }}
                  >
                    {stat.label}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {stat.value}
                  </Typography>
                  {stat.caption && (
                    <Typography variant="body2" color="text.secondary">
                      {stat.caption}
                    </Typography>
                  )}
                  {stat.segments && stat.segments.length > 0 && (
                    <Stack
                      direction="row"
                      spacing={1.5}
                      divider={
                        <Divider
                          flexItem
                          orientation="vertical"
                          sx={{
                            borderColor: (theme) =>
                              alpha(theme.palette.text.primary, 0.12),
                          }}
                        />
                      }
                      sx={{
                        mt: "auto",
                        p: 1.25,
                        borderRadius: 3,
                        backgroundColor: (theme) =>
                          alpha(theme.palette.common.white, 0.65),
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      {stat.segments.map((segment) => (
                        <Stack
                          key={segment.key ?? segment.label}
                          spacing={0.25}
                          sx={{ minWidth: 0 }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {segment.label}
                          </Typography>
                          <Typography
                            variant="subtitle1"
                            sx={{
                              fontWeight: 600,
                              color: segment.color ?? "text.primary",
                            }}
                          >
                            {segment.value}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
        {hasConfirmedArrivals && (
          <Box>
            <Typography variant="subtitle2" color="success.main" sx={{ mb: 1 }}>
              Confirmed import requests (
              {eventsForSelectedDate.confirmed.length})
            </Typography>
            <List
              dense
              disablePadding
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1.5,
                alignItems: "stretch",
              }}
            >
              {confirmedVisible.map((batch, index) => {
                const requestDate = (() => {
                  if (!batch.RequestDate) return "N/A";
                  const parsed = new Date(batch.RequestDate);
                  if (Number.isNaN(parsed.getTime())) {
                    return batch.RequestDate;
                  }
                  return format(parsed, "MMMM d, yyyy");
                })();

                const arrivalDate = (() => {
                  if (!batch.ArrivalDate) return "N/A";
                  const parsed = new Date(batch.ArrivalDate);
                  if (Number.isNaN(parsed.getTime())) {
                    return batch.ArrivalDate;
                  }
                  return format(parsed, "MMMM d, yyyy");
                })();

                const articleDetails = Array.isArray(batch.ArticleDetails)
                  ? batch.ArticleDetails
                  : [];
                const articleSummary = summarizeArticles(articleDetails);
                const articlesDetail = formatArticlesDetail(articleDetails);
                const batchLabel = formatBatchCode(batch.BatchId);
                const resolvedArticleCount = (() => {
                  const numeric = Number(batch.ArticleCount);
                  if (Number.isFinite(numeric) && numeric > 0) {
                    return numeric;
                  }
                  return articleDetails.length;
                })();
                const articleCountLabel =
                  resolvedArticleCount > 0
                    ? `Articles: ${formatNumeric(resolvedArticleCount)}`
                    : null;
                const hasMultipleArticles = resolvedArticleCount > 1;

                const chipItems = [
                  arrivalDate && `Arrival: ${arrivalDate}`,
                  batchLabel ? `Batch: ${batchLabel}` : null,
                  articleCountLabel,
                  Number.isFinite(Number(batch.BoxCount))
                    ? `Boxes: ${formatNumeric(batch.BoxCount)}`
                    : null,
                  Number.isFinite(Number(batch.PalletCount))
                    ? `Pallets: ${formatNumeric(batch.PalletCount)}`
                    : null,
                  batch.ConfirmedBy
                    ? `Confirmed by ${batch.ConfirmedBy}`
                    : null,
                ].filter(Boolean);

                const detailItems = [
                  articlesDetail,
                  Number.isFinite(Number(batch.FullPallets))
                    ? `Full pallets: ${formatNumeric(batch.FullPallets, 2)}`
                    : null,
                  Number.isFinite(Number(batch.RemainingBoxes))
                    ? `Remaining boxes: ${formatNumeric(
                        batch.RemainingBoxes
                      )}`
                    : null,
                  Number.isFinite(Number(batch.TotalShipmentWeightKg))
                    ? `Total weight (kg): ${formatNumeric(
                        batch.TotalShipmentWeightKg,
                        2
                      )}`
                    : null,
                  Number.isFinite(Number(batch.TotalShipmentVolumeM3))
                    ? `Total volume (m3): ${formatNumeric(
                        batch.TotalShipmentVolumeM3,
                        3
                      )}`
                    : null,
                  Number.isFinite(Number(batch.PalletVolumeUtilization))
                    ? `Utilization: ${formatPercent(
                        batch.PalletVolumeUtilization
                      )}`
                    : null,
                  requestDate && `Request date: ${requestDate}`,
                ];

                const detailKey = `confirmed-${
                  batch.BatchKey ?? batch.ID ?? index
                }`;
                const articleKey = `articles-${
                  batch.BatchKey ?? batch.ID ?? index
                }`;
                const hasExpandedDetails =
                  detailItems.some(Boolean) || Boolean(batch.Comment);

                return (
                  <ListItem
                    key={
                      batch.BatchKey ??
                      batch.ID ??
                      `${index}-${articleSummary ?? "batch"}`
                    }
                    alignItems="flex-start"
                    disableGutters
                    sx={{
                      alignSelf: "stretch",
                      flex: {
                        xs: "1 1 100%",
                        sm: `1 1 ${CARD_MIN_WIDTH}px`,
                      },
                      minWidth: {
                        xs: "100%",
                        sm: CARD_MIN_WIDTH,
                      },
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      borderRadius: 2,
                      px: 1.5,
                      py: 1,
                      backgroundColor: (theme) =>
                        alpha(theme.palette.success.main, 0.08),
                      border: (theme) =>
                        `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                    }}
                  >
                    <ListItemText
                      primaryTypographyProps={{
                        variant: "body2",
                        fontWeight: 600,
                        color: "text.primary",
                      }}
                      secondaryTypographyProps={{
                        component: "div",
                      }}
                      primary={batch.Importer ?? "Unknown importer"}
                      sx={{ width: "100%", maxWidth: "100%" }}
                      secondary={
                        <Stack spacing={0.75}>
                          {chipItems.length > 0 && (
                            <Stack
                              direction="row"
                              spacing={0.5}
                              flexWrap="wrap"
                              useFlexGap
                              sx={{
                                rowGap: 0.5,
                                columnGap: 0.5,
                                width: "100%",
                              }}
                            >
                              {chipItems.map((chip) => (
                                <Chip
                                  key={chip}
                                  label={chip}
                                  size="small"
                                  variant="outlined"
                                  sx={BASE_CHIP_STYLES}
                                />
                              ))}
                            </Stack>
                          )}
                          {hasMultipleArticles && articleDetails.length > 0 && (
                            <>
                              <Button
                                type="button"
                                size="small"
                                onClick={() => toggleExpanded(articleKey)}
                                sx={{ alignSelf: "flex-start" }}
                              >
                                {isExpanded(articleKey)
                                  ? "Hide articles"
                                  : `View ${formatNumeric(
                                      resolvedArticleCount
                                    )} articles`}
                              </Button>
                              <Collapse in={isExpanded(articleKey)}>
                                <Stack
                                  spacing={0.5}
                                  sx={{ mt: 0.5, width: "100%" }}
                                >
                                  {articleDetails.map((item, articleIdx) => (
                                    <Chip
                                      key={`${batch.BatchKey}-article-${articleIdx}`}
                                      label={formatArticleLabel(
                                        item.article,
                                        item.articleName
                                      )}
                                      size="small"
                                      variant="outlined"
                                      sx={FULL_WIDTH_CHIP_STYLES}
                                    />
                                  ))}
                                </Stack>
                              </Collapse>
                            </>
                          )}
                          {hasExpandedDetails && (
                            <>
                              <Button
                                type="button"
                                size="small"
                                onClick={() => toggleExpanded(detailKey)}
                                sx={{ alignSelf: "flex-start" }}
                              >
                                {isExpanded(detailKey)
                                  ? "Hide details"
                                  : "Full metrics"}
                              </Button>
                              <Collapse in={isExpanded(detailKey)}>
                                {renderDetailRows(detailItems, {
                                  comment: batch.Comment,
                                  commentLabel: "Note",
                                })}
                              </Collapse>
                            </>
                          )}
                        </Stack>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
            {eventsForSelectedDate.confirmed.length > LIST_PREVIEW_LIMIT && (
              <Box sx={{ mt: 1 }}>
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  onClick={() => setShowAllConfirmed((previous) => !previous)}
                >
                  {showAllConfirmed
                    ? "Show fewer imports"
                    : `View all ${eventsForSelectedDate.confirmed.length} imports`}
                </Button>
              </Box>
            )}
          </Box>
        )}
        {feedback && (
          <Alert severity={feedback.severity}>{feedback.message}</Alert>
        )}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress color="primary" />
          </Box>
        ) : (
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={4}
            alignItems="stretch"
            sx={{ flexWrap: { xs: "wrap", md: "nowrap" }, rowGap: 4 }}
          >
            <Box
              component={Paper}
              elevation={3}
              sx={{
                flexShrink: 0,
                width: { xs: "100%", md: 420 },
                maxWidth: { xs: "100%", lg: 520 },
                alignSelf: "stretch",
                borderRadius: 4,
                p: { xs: 2.5, sm: 3 },
                background: (theme) =>
                  `linear-gradient(135deg, ${alpha(
                    theme.palette.primary.main,
                    0.08
                  )}, ${alpha(theme.palette.primary.light, 0.05)})`,
                boxShadow: (theme) =>
                  `0 20px 40px ${alpha(theme.palette.primary.main, 0.12)}`,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
                <CalendarMonthIcon color="primary" fontSize="medium" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Arrival calendar
                </Typography>
              </Stack>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DateCalendar
                  value={selectedDate}
                  onChange={(value) => value && setSelectedDate(value)}
                  slots={{ day: renderDay }}
                  sx={{
                    borderRadius: 3,
                    p: 1,
                    width: "100%",
                    "& .MuiPickersCalendarHeader-root": {
                      mb: 1,
                    },
                    "& .MuiPickersCalendarHeader-label": {
                      fontWeight: 700,
                      fontSize: "1.1rem",
                    },
                    "& .MuiDayCalendar-weekDayLabel": {
                      fontWeight: 600,
                    },
                    "& .MuiPickersDay-root": {
                      fontWeight: 600,
                      width: 40,
                      height: 40,
                      fontSize: "0.95rem",
                    },
                  }}
                />
              </LocalizationProvider>
            </Box>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" gutterBottom>
                {formattedSelectedDate}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {!hasEventsForSelectedDate ? (
                <Typography variant="body2" color="text.secondary">
                  No arrivals scheduled for this day.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gap: 2.5,
                    gridTemplateColumns: {
                      xs: "1fr",
                    },
                    alignItems: "flex-start",
                  }}
                >
                  {hasWmsArrivals && (
                    <Box>
                      <Typography
                        variant="subtitle2"
                        color="error.main"
                        sx={{ mb: 1 }}
                      >
                        WMS arrivals ({eventsForSelectedDate.wms.length})
                      </Typography>
                      <List
                        dense
                        disablePadding
                        sx={{
                          display: "grid",
                          gap: 1.5,
                          gridTemplateColumns: {
                            xs: "repeat(auto-fit, minmax(260px, 1fr))",
                          },
                          alignItems: "stretch",
                        }}
                      >
                        {wmsVisible.map((order, index) => {
                          const arrivalDate = (() => {
                            if (!order.ArrivalDate) return "N/A";
                            const parsed = new Date(order.ArrivalDate);
                            if (Number.isNaN(parsed.getTime())) {
                              return order.ArrivalDate;
                            }
                            return format(parsed, "MMMM d, yyyy");
                          })();

                          const sourceUpdated = (() => {
                            if (!order.SourceUpdatedAt) return null;
                            const parsed = new Date(order.SourceUpdatedAt);
                            if (Number.isNaN(parsed.getTime())) {
                              return order.SourceUpdatedAt;
                            }
                            return format(parsed, "MMMM d, yyyy HH:mm");
                          })();

                          const chipItems = [
                            arrivalDate && `Arrival: ${arrivalDate}`,
                            order.Article || order.ArticleDescription
                              ? `Article: ${formatArticleLabel(
                                  order.Article,
                                  order.ArticleDescription
                                )}`
                              : null,
                            Number.isFinite(Number(order.BoxCount))
                              ? `Boxes: ${formatNumeric(order.BoxCount)}`
                              : null,
                            Number.isFinite(Number(order.PalletCount))
                              ? `Pallets: ${formatNumeric(order.PalletCount)}`
                              : null,
                          ].filter(Boolean);

                          const detailItems = [
                            sourceUpdated
                              ? `Source updated: ${sourceUpdated}`
                              : null,
                          ];

                          const detailKey = `wms-${
                            order.NarID ??
                            order.OrderNumber ??
                            `${index}-${order.Article ?? "order"}`
                          }`;
                          const hasExpandedDetails =
                            detailItems.some(Boolean) || Boolean(order.Comment);

                          return (
                            <ListItem
                              key={detailKey}
                              alignItems="flex-start"
                              disableGutters
                              sx={{
                                borderRadius: 2,
                                px: 1.5,
                                py: 1,
                                backgroundColor: (theme) =>
                                  alpha(theme.palette.error.main, 0.08),
                                border: (theme) =>
                                  `1px solid ${alpha(
                                    theme.palette.error.main,
                                    0.25
                                  )}`,
                                display: "flex",
                                flexDirection: "column",
                                gap: 0.5,
                              }}
                            >
                              <ListItemText
                                primaryTypographyProps={{
                                  variant: "body2",
                                  fontWeight: 600,
                                  color: "text.primary",
                                }}
                                secondaryTypographyProps={{
                                  component: "div",
                                }}
                                primary={`${
                                  order.Importer ?? "Unknown importer"
                                } - ${
                                  order.OrderNumber
                                    ? `Order ${order.OrderNumber}`
                                    : `NarID ${order.NarID ?? "N/A"}`
                                }`}
                                sx={{ width: "100%", maxWidth: "100%" }}
                                secondary={
                                  <Stack spacing={0.75}>
                                    {chipItems.length > 0 && (
                                      <Stack
                                        direction="row"
                                        spacing={0.5}
                                        useFlexGap
                                        flexWrap="wrap"
                                        sx={{ rowGap: 0.5, columnGap: 0.5 }}
                                      >
                                        {chipItems.map((chip) => (
                                          <Chip
                                            key={chip}
                                            label={chip}
                                            size="small"
                                            variant="outlined"
                                            sx={BASE_CHIP_STYLES}
                                          />
                                        ))}
                                      </Stack>
                                    )}

                                    {hasExpandedDetails && (
                                      <>
                                        <Button
                                          type="button"
                                          size="small"
                                          onClick={() =>
                                            toggleExpanded(detailKey)
                                          }
                                          sx={{ alignSelf: "flex-start" }}
                                        >
                                          {isExpanded(detailKey)
                                            ? "Hide details"
                                            : "Full metrics"}
                                        </Button>
                                        <Collapse in={isExpanded(detailKey)}>
                                          {renderDetailRows(detailItems, {
                                            comment: order.Comment,
                                            commentLabel: "Comment",
                                          })}
                                        </Collapse>
                                      </>
                                    )}
                                  </Stack>
                                }
                              />
                            </ListItem>
                          );
                        })}
                      </List>
                      {eventsForSelectedDate.wms.length > LIST_PREVIEW_LIMIT && (
                        <Box sx={{ mt: 1 }}>
                          <Button
                            type="button"
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => setShowAllWms((previous) => !previous)}
                          >
                            {showAllWms
                              ? "Show fewer WMS orders"
                              : `View all ${eventsForSelectedDate.wms.length} WMS orders`}
                          </Button>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
};

export default CalendarOverview;
