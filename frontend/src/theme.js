import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1b4b91",
      light: "#4f79c8",
    },
    secondary: {
      main: "#2eb88a",
      light: "#63d6ad",
    },
    info: {
      main: "#3b82f6",
      light: "#60a5fa",
    },
    background: {
      default: "#f3f6fc",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: "'Inter', 'Roboto', 'Helvetica', 'Arial', sans-serif",
    h1: {
      fontWeight: 600,
    },
    h2: {
      fontWeight: 600,
    },
    h3: {
      fontWeight: 600,
      letterSpacing: "-0.01em",
    },
    button: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          textTransform: "none",
          paddingLeft: 24,
          paddingRight: 24,
          boxShadow: "0 10px 18px rgba(27, 75, 145, 0.18)",
        },
        containedSecondary: {
          boxShadow: "0 10px 18px rgba(46, 184, 138, 0.25)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 24,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 24,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: "100vh",
          margin: 0,
          background:
            "radial-gradient(circle at 10% 20%, #f0f6ff 0%, #fdfdff 45%, #edf5ff 100%)",
        },
        "#root": {
          minHeight: "100vh",
        },
      },
    },
  },
});

export default theme;
