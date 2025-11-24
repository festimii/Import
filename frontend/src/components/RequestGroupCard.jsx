import { useState } from "react";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Collapse,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import { formatArticleLabel } from "../utils/formatArticle";

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString();
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return "—";
};

const formatQuantity = (value, fractionDigits = 0) => {
  if (value === null || value === undefined) return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

const MetricGrid = ({ metrics }) => {
  const visibleMetrics = metrics.filter((metric) => metric.value !== "—");

  if (visibleMetrics.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  return (
    <Grid container spacing={1.5} columns={12}>
      {visibleMetrics.map((metric) => (
        <Grid item xs={12} sm={6} key={metric.label}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {metric.label}
            </Typography>
            <Typography variant="body1" fontWeight={600}>
              {metric.value}
            </Typography>
            {metric.secondary && (
              <Typography variant="caption" color="text.secondary">
                {metric.secondary}
              </Typography>
            )}
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
};

export default function RequestGroupCard({
  group,
  onApprove,
  onReject,
  onProposeDate,
  onViewHistory,
}) {
  const theme = useTheme();
  const [showDetails, setShowDetails] = useState(false);

  const sharedArrivalDate = group.sharedArrivalDate
    ? formatDate(group.sharedArrivalDate)
    : group.arrivalDateConflict
    ? "Multiple dates"
    : "N/A";

  const slaLabel = (() => {
    const target = group.sharedArrivalDate || group.requestDate || null;
    if (!target) return null;
    const parsed = new Date(target);
    if (Number.isNaN(parsed.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) return "Arrives today";
    if (diffDays < 0) return `${Math.abs(diffDays)} day(s) overdue`;
    return `${diffDays} day(s) to arrival`;
  })();

  return (
    <Card
      elevation={12}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 4,
        background: `linear-gradient(150deg, ${alpha(
          theme.palette.background.paper,
          0.9
        )} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 3,
                backgroundColor: alpha(theme.palette.secondary.main, 0.12),
                color: theme.palette.secondary.main,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
              }}
            >
              <LocalShippingRoundedIcon />
            </Box>
            <Stack spacing={0.5}>
              <Typography variant="overline" color="primary" sx={{ letterSpacing: 1 }}>
                Request bill #{group.reference}
              </Typography>
              <Typography variant="h6">{group.importer}</Typography>
            </Stack>
            <Chip
              label={`${group.items.length} article${group.items.length === 1 ? "" : "s"}`}
              size="small"
              sx={{
                marginLeft: "auto",
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
              }}
            />
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Stack spacing={1.5}>
            <Stack
              spacing={0.5}
              direction={{ xs: "column", sm: "row" }}
              gap={{ sm: 6 }}
              alignItems={{ sm: "center" }}
            >
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Request date
                </Typography>
                <Typography variant="body1">{formatDate(group.requestDate)}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Arrival date (Data Arritjes)
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body1">{sharedArrivalDate}</Typography>
                  {group.arrivalDateConflict && (
                    <Chip
                      label="Multiple dates"
                      color="warning"
                      size="small"
                      variant="outlined"
                    />
                  )}
                  {slaLabel && (
                    <Chip
                      label={slaLabel}
                      color={
                        slaLabel.includes("overdue")
                          ? "error"
                          : slaLabel.includes("today")
                          ? "warning"
                          : "success"
                      }
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Stack>
              </Box>
            </Stack>

            <Stack spacing={0.75}>
              <Typography variant="subtitle2" color="text.secondary">
                Load summary
              </Typography>
              <MetricGrid
                metrics={[
                  {
                    label: "Total boxes",
                    value: formatQuantity(group.totalBoxes),
                    secondary: [
                      group.totalFullPallets
                        ? `${formatQuantity(group.totalFullPallets, 2)} full pallets`
                        : null,
                      group.totalRemainingBoxes
                        ? `${formatQuantity(group.totalRemainingBoxes)} loose boxes`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" • ") || null,
                  },
                  {
                    label: "Calculated pallets",
                    value: formatQuantity(group.totalPallets),
                  },
                  {
                    label: "Total shipment weight (kg)",
                    value: formatQuantity(group.totalShipmentWeightKg, 2),
                    secondary:
                      group.totalWeightFullPalletsKg || group.totalWeightRemainingKg
                        ? [
                            group.totalWeightFullPalletsKg
                              ? `${formatQuantity(
                                  group.totalWeightFullPalletsKg,
                                  2
                                )} on full pallets`
                              : null,
                            group.totalWeightRemainingKg
                              ? `${formatQuantity(
                                  group.totalWeightRemainingKg,
                                  2
                                )} remaining`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" • ") || null
                        : null,
                  },
                  {
                    label: "Total shipment volume (m³)",
                    value: formatQuantity(group.totalShipmentVolumeM3, 3),
                    secondary:
                      group.totalVolumeFullPalletsM3 || group.totalVolumeRemainingM3
                        ? [
                            group.totalVolumeFullPalletsM3
                              ? `${formatQuantity(
                                  group.totalVolumeFullPalletsM3,
                                  3
                                )} on full pallets`
                              : null,
                            group.totalVolumeRemainingM3
                              ? `${formatQuantity(
                                  group.totalVolumeRemainingM3,
                                  3
                                )} remaining`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" • ") || null
                        : null,
                  },
                ]}
              />
            </Stack>

            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
                spacing={1}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  Articles in this bill
                </Typography>
                <Button
                  type="button"
                  size="small"
                  onClick={() => setShowDetails((prev) => !prev)}
                >
                  {showDetails
                    ? "Hide articles"
                    : `Show articles (${group.items.length})`}
                </Button>
              </Stack>
              <Collapse in={showDetails} unmountOnExit>
                <Stack spacing={1.5}>
                  {group.items.map((item) => (
                    <Box
                    key={item.ID}
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                      backgroundColor: alpha(theme.palette.background.paper, 0.6),
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        justifyContent="space-between"
                        alignItems={{ sm: "center" }}
                      >
                        <Box>
                          <Typography variant="body1" fontWeight={600}>
                            {formatArticleLabel(item.Article, item.ArticleName)}
                          </Typography>
                          {item.Comment && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ whiteSpace: "pre-wrap" }}
                            >
                              {item.Comment}
                            </Typography>
                          )}
                        </Box>
                        <Chip
                          label={`Requested by ${item.Requester ?? "—"}`}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>

                      <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                          <Stack spacing={0.75}>
                            <Typography variant="caption" color="text.secondary">
                              Load plan
                            </Typography>
                            <MetricGrid
                              metrics={[
                                {
                                  label: "Boxes",
                                  value: formatQuantity(item.BoxCount),
                                },
                                {
                                  label: "Pallets",
                                  value: formatQuantity(item.PalletCount),
                                },
                                {
                                  label: "Full pallets",
                                  value: formatQuantity(item.FullPallets, 2),
                                },
                                {
                                  label: "Remaining boxes",
                                  value: formatQuantity(item.RemainingBoxes),
                                },
                              ]}
                            />
                          </Stack>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Stack spacing={0.75}>
                            <Typography variant="caption" color="text.secondary">
                              Weight &amp; volume
                            </Typography>
                            <MetricGrid
                              metrics={[
                                {
                                  label: "Total shipment weight (kg)",
                                  value: formatQuantity(item.TotalShipmentWeightKg, 2),
                                },
                                {
                                  label: "Total shipment volume (m³)",
                                  value: formatQuantity(item.TotalShipmentVolumeM3, 3),
                                },
                                {
                                  label: "Pallet weight (kg)",
                                  value: formatQuantity(item.PalletWeightKg, 2),
                                },
                                {
                                  label: "Box weight (kg)",
                                  value: formatQuantity(item.BoxWeightKg, 2),
                                },
                              ]}
                            />
                          </Stack>
                        </Grid>
                      </Grid>
                    </Stack>
                  </Box>
                  ))}
                </Stack>

                {group.comments.length > 0 && (
                  <Stack spacing={0.5} sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Requester notes
                    </Typography>
                    {group.comments.map((comment, index) => (
                      <Typography
                        key={`${comment}-${index}`}
                        variant="body2"
                        sx={{ whiteSpace: "pre-wrap" }}
                      >
                        {comment}
                      </Typography>
                    ))}
                  </Stack>
                )}
              </Collapse>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
      <CardActions
        sx={{
          px: 3,
          pb: 3,
          display: "flex",
          flexWrap: "wrap",
          gap: 1.5,
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
        }}
      >
        {onProposeDate && (
          <Button
            variant="text"
            color="secondary"
            startIcon={<EventRepeatRoundedIcon />}
            onClick={() => onProposeDate(group)}
          >
            Propose new date
          </Button>
        )}
        {onViewHistory && group.batchId && (
          <Button
            variant="text"
            color="primary"
            onClick={() => onViewHistory(group)}
          >
            View history
          </Button>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<CloseRoundedIcon />}
            onClick={() => onReject(group)}
          >
            Reject all
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<CheckRoundedIcon />}
            onClick={() => onApprove(group)}
          >
            Approve all
          </Button>
        </Box>
      </CardActions>
    </Card>
  );
}
