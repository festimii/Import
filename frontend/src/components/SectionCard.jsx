import { alpha } from "@mui/material/styles";
import { Box, Paper, Stack, Typography } from "@mui/material";

const SectionCard = ({
  title,
  description,
  action,
  secondaryAction,
  children,
  sx,
  contentProps,
  variant = "outlined",
}) => {
  const isMinimal = variant === "minimal";

  return (
    <Paper
      elevation={isMinimal ? 0 : 8}
      sx={{
        p: { xs: 3, md: 4 },
        borderRadius: 4,
        backgroundColor: isMinimal ? "transparent" : "background.paper",
        border: (theme) =>
          `1px solid ${alpha(
            theme.palette.primary.main,
            isMinimal ? 0.04 : 0.08
          )}`,
        boxShadow: isMinimal
          ? "none"
          : (theme) => `0 20px 45px ${alpha(theme.palette.common.black, 0.06)}`,
        ...sx,
      }}
    >
      <Stack spacing={isMinimal ? 2.5 : 3} {...contentProps}>
        {(title || description || action || secondaryAction) && (
          <Stack
            direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 220 }}>
            {title && (
              <Typography variant="h6" component="h2">
                {title}
              </Typography>
            )}
            {description && (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            )}
          </Stack>
          {(action || secondaryAction) && (
            <Stack
              direction="row"
              spacing={1}
              justifyContent="flex-end"
              alignItems="center"
              flexWrap="wrap"
            >
              {secondaryAction}
              {action}
            </Stack>
          )}
        </Stack>
        )}
        <Box>{children}</Box>
      </Stack>
    </Paper>
  );
};

export default SectionCard;
