const searchParams = new URLSearchParams(window.location.search);
const isCustomerDashboardView = searchParams.get("customerView") === "1";

if (isCustomerDashboardView) {
  const originalPrompt = window.prompt.bind(window);

  window.prompt = (message, defaultValue) => {
    if (message === "Enter admin password:") {
      return import.meta.env.VITE_ADMIN_PASSWORD || "";
    }

    if (message === "Enter manager delete password:") {
      return import.meta.env.VITE_DELETE_PASSWORD || "";
    }

    return originalPrompt(message, defaultValue);
  };
}

await import("./main.js");
