import { createSystem, defaultConfig } from "@chakra-ui/react"
import { buttonRecipe } from "./theme/button.recipe"

export const system = createSystem(defaultConfig, {
  globalCss: {
    html: {
      fontSize: "16px",
    },
    body: {
      fontSize: "0.875rem",
      margin: 0,
      padding: 0,
      bg: "#f0f4f8",
      color: "#1a202c",
    },
    ".main-link": {
      color: "#1a56db",
      fontWeight: "bold",
    },
  },
  theme: {
    tokens: {
      colors: {
        ui: {
          main: { value: "#1a56db" },
        },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          value: { _light: "#f0f4f8", _dark: "#f0f4f8" },
        },
        "bg.subtle": {
          value: { _light: "#ffffff", _dark: "#ffffff" },
        },
        border: {
          value: { _light: "#e2e8f0", _dark: "#e2e8f0" },
        },
      },
    },
    recipes: {
      button: buttonRecipe,
    },
  },
})
