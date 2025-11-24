import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, CssBaseline, GlobalStyles } from "@mui/material";
import App from "./App.jsx";
import "./index.css";
import theme from "./theme";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ".css-k2xhbz": {
            background: "transparent !important",
            borderBottom: "none !important",
            WebkitBackdropFilter: "none !important",
            backdropFilter: "none !important",
          },
        }}
      />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
