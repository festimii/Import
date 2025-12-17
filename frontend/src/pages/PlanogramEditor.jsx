import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  Grid,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import ZoomInMapRoundedIcon from "@mui/icons-material/ZoomInMapRounded";
import ZoomOutMapRoundedIcon from "@mui/icons-material/ZoomOutMapRounded";
import API from "../api";
import PageHero from "../components/PageHero";
import SectionCard from "../components/SectionCard";
import OrientationPreview from "../components/OrientationPreview";

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatMm = (value) => {
  const num = toNumber(value);
  if (num === null) return "n/a";
  if (Math.abs(num) >= 1000) {
    return `${(num / 1000).toFixed(2)} m`;
  }
  return `${num.toFixed(0)} mm`;
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

const buildPhotoSrc = (photoUrl, backendBase) => {
  if (!photoUrl) return null;
  if (photoUrl.startsWith("http")) return photoUrl;
  const base = backendBase.replace(/\/+$/, "");
  const path = photoUrl.startsWith("/") ? photoUrl : `/${photoUrl}`;
  return `${base}${path}`;
};

const placementKey = (item) => `${item.internalId}-${item.sifraArt}`;

const computeScale = (items, shelfWidth, shelfHeight) => {
  if (!Array.isArray(items) || items.length === 0) return 1;
  const maxX = Math.max(...items.map((item) => toNumber(item.x) || 0), 1);
  const maxZ = Math.max(...items.map((item) => toNumber(item.z) || 0), 1);
  const scaleX = shelfWidth / maxX;
  const scaleZ = shelfHeight / maxZ;
  return Math.min(scaleX, scaleZ, 6);
};

const ShelfPreview = ({
  items,
  selectedKey,
  placements,
  shelfWidthMm,
  shelfHeightMm,
  shelfRef,
  onDropItem,
  onDragOverShelf,
  onDragLeaveShelf,
  draggingKey,
  dropPreview,
  zoom,
}) => {
  const shelfWidth = Math.max(300, (toNumber(shelfWidthMm) || 180) * 10); // cm to px
  const shelfHeight = Math.max(200, (toNumber(shelfHeightMm) || 140) * 10); // cm to px

  const scale = useMemo(
    () => computeScale(items, shelfWidth, shelfHeight),
    [items, shelfWidth, shelfHeight]
  );

  return (
    <Box
      sx={{
        borderRadius: 3,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        background: (theme) => theme.palette.background.paper,
        minHeight: shelfHeight + 60,
        p: 2,
        boxShadow: (theme) => theme.shadows[1],
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <WarehouseRoundedIcon color="primary" />
        <Typography variant="subtitle1">Shelf preview</Typography>
        <Chip
          label={`Items: ${items.length}`}
          size="small"
          variant="outlined"
          color="primary"
        />
        <Chip label="Scale: mm to px" size="small" />
      </Stack>

      <Box
        sx={{
          position: "relative",
          width: "100%",
          minHeight: shelfHeight * zoom,
          borderRadius: 2,
          border: "2px solid #f5f5f5",
          backgroundColor: "#111",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.25) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.25) 2px, transparent 2px), repeating-linear-gradient(180deg, transparent 0px, transparent 90px, rgba(0,0,0,0.7) 90px, rgba(0,0,0,0.7) 100px)",
          backgroundSize: "20px 20px, 20px 20px, 100px 100px, 100px 100px, 120px 120px",
          backgroundRepeat: "repeat",
          backgroundBlendMode: "overlay",
          p: 2,
          overflow: "visible",
          outline: "none",
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
        ref={shelfRef}
        onDragOver={onDragOverShelf}
        onDrop={onDropItem}
        onDragLeave={onDragLeaveShelf}
      >
        {dropPreview && (
          <Box
            sx={{
              position: "absolute",
              left: dropPreview.left,
              bottom: dropPreview.bottom,
              width: dropPreview.width,
              height: dropPreview.height,
              border: "2px dashed rgba(255,255,255,0.9)",
              borderRadius: 0,
              pointerEvents: "none",
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          />
        )}
        {items.map((item) => {
          const key = `${item.internalId}-${item.sifraArt}`;
          const placement = placements?.[key];
          const widthPx = Math.max(20, (toNumber(item.x) || 120) * scale);
          const heightPx = Math.max(20, (toNumber(item.z) || 200) * scale);
          const isSelected =
            selectedKey &&
            item.internalId === selectedKey.internalId &&
            item.sifraArt === selectedKey.sifraArt;
          const hasPlacement =
            placement &&
            toNumber(placement.posXmm) !== null &&
            toNumber(placement.posZmm) !== null &&
            shelfWidth > 0 &&
            shelfHeight > 0;
          const leftPx = hasPlacement
            ? Math.min(
                Math.max(0, toNumber(placement.posXmm) || 0),
                Math.max(0, shelfWidth - widthPx)
              )
            : null;
          const bottomPx = hasPlacement
            ? Math.min(
                Math.max(0, toNumber(placement.posZmm) || 0),
                Math.max(0, shelfHeight - heightPx)
              )
            : null;

          return (
            <Box
              key={key}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", key);
                  setDraggingKey(key);
                }}
              onDragEnd={() => {
                setDraggingKey(null);
                setDropPreview(null);
              }}
              sx={{
                width: Math.min(widthPx, shelfWidth),
                height: Math.min(heightPx, shelfHeight),
                borderRadius: 0,
                border: "none",
                backgroundColor: "transparent",
                boxShadow: "none",
                display: "flex",
                overflow: "hidden",
                position: hasPlacement ? "absolute" : "relative",
                left: hasPlacement ? `${leftPx}px` : "auto",
                bottom: hasPlacement ? `${bottomPx}px` : "auto",
                m: hasPlacement ? 0 : 1,
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "transparent",
                  p: 0,
                }}
              >
                {item.photoSrc ? (
                  <img
                    src={item.photoSrc}
                      alt={item.articleName || item.sifraArt}
                      style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      borderRadius: 0,
                    }}
                  />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    No photo
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default function PlanogramEditor() {
  const [planogramIdInput, setPlanogramIdInput] = useState("");
  const [internalIdInput, setInternalIdInput] = useState("");
  const [shelfIdInput, setShelfIdInput] = useState("");
  const [moduleIdInput, setModuleIdInput] = useState("");
  const [shelfWidthInput, setShelfWidthInput] = useState("250"); // cm
  const [shelfHeightInput, setShelfHeightInput] = useState("206"); // cm
  const [shelfDepthInput, setShelfDepthInput] = useState("40"); // cm (metadata)
  const [items, setItems] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openDrawer, setOpenDrawer] = useState(false);
  const [placements, setPlacements] = useState({});
  const [draggingKey, setDraggingKey] = useState(null);
  const [dropPreview, setDropPreview] = useState(null);
  const [zoom, setZoom] = useState(1);
  const backendBase = useMemo(() => resolveBackendBase(), []);
  const shelfRef = useRef(null);

  const selectedItem = useMemo(() => {
    if (!selectedKey) return null;
    return items.find(
      (item) =>
        item.internalId === selectedKey.internalId &&
        item.sifraArt === selectedKey.sifraArt
    );
  }, [items, selectedKey]);

  const setPlacementValue = (key, field, value) => {
    setPlacements((prev) => {
      const current = prev[key] || {};
      return {
        ...prev,
        [key]: { ...current, [field]: value },
      };
    });
  };

  const handleDragStart = (item) => (event) => {
    event.dataTransfer.setData("text/plain", placementKey(item));
    setDraggingKey(placementKey(item));
  };

  const handleDrop = (event) => {
    event.preventDefault();
    if (!shelfRef.current) return;

    const key = event.dataTransfer.getData("text/plain");
    const item = items.find((i) => placementKey(i) === key);
    if (!item) return;

    const rect = shelfRef.current.getBoundingClientRect();
    const xPx = event.clientX - rect.left;
    const yPx = event.clientY - rect.top;

    const shelfWidthPx = Math.max(1, rect.width);
    const shelfHeightPx = Math.max(1, rect.height);
    const scale = computeScale(items, shelfWidthPx, shelfHeightPx);
    const widthPx = Math.max(20, (toNumber(item.x) || 120) * scale);
    const heightPx = Math.max(20, (toNumber(item.z) || 200) * scale);

    const clampedX = Math.min(Math.max(0, xPx - widthPx / 2), shelfWidthPx - widthPx);
    const clampedY = Math.min(Math.max(0, yPx - heightPx / 2), shelfHeightPx - heightPx);

    const posXmm = Number(clampedX.toFixed(2));
    const posZmm = Number((shelfHeightPx - clampedY - heightPx).toFixed(2));

    setPlacementValue(key, "posXmm", posXmm);
    setPlacementValue(key, "posZmm", posZmm);
    setSelectedKey({ internalId: item.internalId, sifraArt: item.sifraArt });
    setDraggingKey(null);
    setDropPreview(null);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    if (!shelfRef.current || !draggingKey) return;
    const item = items.find((i) => placementKey(i) === draggingKey);
    if (!item) return;

    const rect = shelfRef.current.getBoundingClientRect();
    const xPx = event.clientX - rect.left;
    const yPx = event.clientY - rect.top;
    const shelfWidthPx = Math.max(1, rect.width);
    const shelfHeightPx = Math.max(1, rect.height);
    const scale = computeScale(items, shelfWidthPx, shelfHeightPx);
    const widthPx = Math.max(20, (toNumber(item.x) || 120) * scale);
    const heightPx = Math.max(20, (toNumber(item.z) || 200) * scale);

    const clampedX = Math.min(Math.max(0, xPx - widthPx / 2), shelfWidthPx - widthPx);
    const clampedY = Math.min(Math.max(0, yPx - heightPx / 2), shelfHeightPx - heightPx);

    setDropPreview({
      left: clampedX,
      bottom: shelfHeightPx - clampedY - heightPx,
      width: widthPx,
      height: heightPx,
    });
  };

  useEffect(() => {
    if (items.length === 0) {
      setSelectedKey(null);
    } else if (items.length > 0 && !selectedKey) {
      setSelectedKey({ internalId: items[0].internalId, sifraArt: items[0].sifraArt });
    }
  }, [items, selectedKey]);

  const fetchItems = async () => {
    const trimmedPlanogram = planogramIdInput.trim();
    const trimmedInternal = internalIdInput.trim();
    const trimmedShelf = shelfIdInput.trim();
    const trimmedModule = moduleIdInput.trim();

    if (!trimmedPlanogram && !trimmedInternal && !trimmedShelf && !trimmedModule) {
      setError("Provide a Planogram ID, Shelf ID, Module ID or Internal ID to load layouts.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = {
        planogramId: trimmedPlanogram || undefined,
        shelfId: trimmedShelf || undefined,
        internalId: trimmedInternal || undefined,
        moduleId: trimmedModule || undefined,
        pageSize: 200,
      };
      const res = await API.get("/planograms/search", { params });
      const records = Array.isArray(res.data) ? res.data : res.data?.items ?? [];

      let layoutPositions = {};
      if (trimmedShelf) {
        try {
          const layoutRes = await API.get("/planograms/shelf-layout", {
            params: { shelfId: trimmedShelf },
          });
          const layoutItems = Array.isArray(layoutRes.data?.items) ? layoutRes.data.items : [];
          layoutPositions = layoutItems.reduce((acc, item) => {
            const key = `${item.internalId}-${item.sifraArt}`;
            acc[key] = {
              posXmm: toNumber(item.posXmm),
              posZmm: toNumber(item.posZmm),
            };
            return acc;
          }, {});
        } catch (_err) {
          // ignore layout load errors to keep main data
        }
      }

      const enriched = records.map((record) => {
        const key = `${record.internalId}-${record.sifraArt}`;
        const placement = layoutPositions[key] || {};
        return {
          ...record,
          photoSrc: buildPhotoSrc(record.photoUrl, backendBase),
          posXmm: placement.posXmm ?? null,
          posZmm: placement.posZmm ?? null,
        };
      });

      setPlacements((prev) => ({ ...prev, ...layoutPositions }));
      setItems((prev) => {
        const map = new Map();
        prev.forEach((item) => {
          const key = placementKey(item);
          map.set(key, item);
        });
        enriched.forEach((item) => {
          const key = placementKey(item);
          map.set(key, { ...(map.get(key) || {}), ...item });
        });
        return Array.from(map.values());
      });

      if (!selectedKey && enriched.length > 0) {
        setSelectedKey({
          internalId: enriched[0].internalId,
          sifraArt: enriched[0].sifraArt,
        });
      }
    } catch (err) {
      setError("Unable to load planogram layouts right now.");
    } finally {
      setLoading(false);
    }
  };

  const saveShelfLayout = async () => {
    const trimmedShelf = shelfIdInput.trim();
    if (!trimmedShelf) {
      setError("Shelf ID is required to save layout.");
      return;
    }

    const positions = items
      .map((item) => {
        const key = placementKey(item);
        const placement = placements[key] || {};
        return {
          internalId: item.internalId,
          sifraArt: item.sifraArt,
          posXmm: toNumber(placement.posXmm),
          posZmm: toNumber(placement.posZmm),
        };
      })
      .filter(
        (pos) =>
          pos.internalId &&
          pos.sifraArt &&
          Number.isFinite(pos.posXmm) &&
          Number.isFinite(pos.posZmm)
      );

    if (positions.length === 0) {
      setError("Add position (X/Z) values for at least one product before saving.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await API.post("/planograms/shelf-layout", {
        shelfId: trimmedShelf,
        positions,
      });
    } catch (err) {
      setError("Unable to save shelf layout.");
    } finally {
      setLoading(false);
    }
  };

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
        title="Planogram editor"
        subtitle="Use standard shelf metrics (H 206 cm, D 40 cm, modular width) and drag products to place them."
        actions={[
          <Button
            key="toggle-nav"
            variant="outlined"
            startIcon={<ShoppingCartRoundedIcon />}
            onClick={() => setOpenDrawer((prev) => !prev)}
          >
            {openDrawer ? "Hide products" : "Show products"}
          </Button>,
        ]}
      />

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <SectionCard
              title="Load planogram"
              description="Fetch layouts by Planogram ID, Shelf ID or Internal ID."
              action={
                <Button
                  variant="outlined"
                  startIcon={<RefreshRoundedIcon />}
                  onClick={() => {
                    setPlanogramIdInput("");
                    setInternalIdInput("");
                    setShelfIdInput("");
                    setItems([]);
                    setSelectedKey(null);
                    setError(null);
                  }}
                >
                  Clear
                </Button>
              }
            >
              <Stack spacing={2}>
                <TextField
                  label="Planogram ID"
                  value={planogramIdInput}
                  onChange={(event) => setPlanogramIdInput(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Shelf ID"
                  value={shelfIdInput}
                  onChange={(event) => setShelfIdInput(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Internal ID"
                  value={internalIdInput}
                  onChange={(event) => setInternalIdInput(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Module ID"
                  value={moduleIdInput}
                  onChange={(event) => setModuleIdInput(event.target.value)}
                  fullWidth
                />
                {error && (
                  <Alert severity="warning" onClose={() => setError(null)}>
                    {error}
                  </Alert>
                )}
                <Button
                  variant="contained"
                  onClick={fetchItems}
                  startIcon={loading ? <CircularProgress size={20} /> : <WarehouseRoundedIcon />}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Load layouts"}
                </Button>
              </Stack>
            </SectionCard>

            <SectionCard
              title="Product list"
              description="Select a product to highlight it on the shelf."
              dense
            >
              <Drawer
                variant="permanent"
                open={openDrawer}
                PaperProps={{
                  sx: {
                    position: "relative",
                    width: "100%",
                    maxWidth: 360,
                    height: "auto",
                    maxHeight: 520,
                    borderRadius: 2,
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    boxShadow: (theme) => theme.shadows[1],
                    overflow: "hidden",
                  },
                }}
              >
                <List dense disablePadding>
                  {items.length === 0 && (
                    <Box sx={{ p: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        No products loaded yet.
                      </Typography>
                    </Box>
                  )}
                  {items.map((item) => {
                    return (
                      <ListItemButton
                        key={`${item.internalId}-${item.sifraArt}`}
                        draggable
                        onDragStart={handleDragStart(item)}
                        sx={{ alignItems: "flex-start" }}
                        title="Drag onto the shelf to place this product"
                      >
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2">{item.sifraArt}</Typography>
                              {item.planogramId && (
                                <Chip
                                  label={item.planogramId}
                                  size="small"
                                  variant="outlined"
                                  color="primary"
                                />
                              )}
                              {item.shelfId && (
                                <Chip
                                  label={item.shelfId}
                                  size="small"
                                  variant="outlined"
                                  color="secondary"
                                />
                              )}
                            </Stack>
                          }
                          secondary={
                            <Stack spacing={0.5}>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {item.articleName || "Unnamed product"}
                              </Typography>
                              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                <Chip size="small" label={`X ${formatMm(item.x)}`} />
                                <Chip size="small" label={`Y ${formatMm(item.y)}`} />
                                <Chip size="small" label={`Z ${formatMm(item.z)}`} />
                              </Stack>
                            </Stack>
                          }
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Drawer>
            </SectionCard>
          </Grid>

          <Grid item xs={12} md={9}>
            <SectionCard
              title="Shelf planner"
              description="Scaled preview uses millimeter dimensions for width (X) and height (Z); depth (Y) is shown on the chips."
            >
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                  <TextField
                    label="Shelf width (cm)"
                    type="number"
                    value={shelfWidthInput}
                    onChange={(event) => setShelfWidthInput(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Shelf height (cm)"
                    type="number"
                    value={shelfHeightInput}
                    onChange={(event) => setShelfHeightInput(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Shelf depth (cm)"
                    type="number"
                    value={shelfDepthInput}
                    onChange={(event) => setShelfDepthInput(event.target.value)}
                    fullWidth
                    helperText="Depth is informational; placements are 2D."
                  />
                  <Button
                    variant="contained"
                    onClick={saveShelfLayout}
                    disabled={loading || items.length === 0}
                  >
                    Save shelf layout
                  </Button>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                      variant="outlined"
                      startIcon={<ZoomOutMapRoundedIcon />}
                      onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                    >
                      Zoom out
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<ZoomInMapRoundedIcon />}
                      onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
                    >
                      Zoom in
                    </Button>
                    <Typography variant="caption">Zoom: {(zoom * 100).toFixed(0)}%</Typography>
                  </Stack>
                </Stack>

                <ShelfPreview
                  items={items}
                  selectedKey={selectedKey}
                  placements={placements}
                  shelfWidthMm={shelfWidthInput}
                  shelfHeightMm={shelfHeightInput}
                  shelfRef={shelfRef}
                  onDropItem={handleDrop}
                  onDragOverShelf={handleDragOver}
                  onDragLeaveShelf={() => setDropPreview(null)}
                  draggingKey={draggingKey}
                  dropPreview={dropPreview}
                  zoom={zoom}
                />

                {selectedItem && (
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                      backgroundColor: (theme) => theme.palette.background.paper,
                    }}
                  >
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                        <OrientationPreview
                          x={selectedItem.x}
                          y={selectedItem.y}
                          z={selectedItem.z}
                          size={160}
                          showLegend
                        />
                        <Divider flexItem orientation="vertical" sx={{ display: { xs: "none", sm: "block" } }} />
                        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1">
                            {selectedItem.sifraArt} - {selectedItem.articleName || "Unnamed"}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Planogram: {selectedItem.planogramId || "N/A"} | Shelf:{" "}
                            {selectedItem.shelfId || "N/A"} | Module: {selectedItem.moduleId || "N/A"}
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`X ${formatMm(selectedItem.x)}`} />
                            <Chip label={`Y ${formatMm(selectedItem.y)}`} />
                            <Chip label={`Z ${formatMm(selectedItem.z)}`} />
                            {selectedItem.photoSrc && (
                              <Tooltip title="Open photo">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => window.open(selectedItem.photoSrc, "_blank")}
                                >
                                  Open photo
                                </Button>
                              </Tooltip>
                            )}
                          </Stack>
                        </Stack>
                      </Stack>
                    </Box>
                  )}
              </Stack>
            </SectionCard>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
