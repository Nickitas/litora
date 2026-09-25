import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { AppProviders } from "./app/providers";
import { routes } from "./app/routes";
import { RouteError } from "./app/route-error";
import { Layout } from "./shared/ui";

import "./shared/styles/index.css";

const router = createBrowserRouter(
  routes.map((route) => ({
    path: route.path,
    element: (
      <Layout>
        <route.Component />
      </Layout>
    ),
    errorElement: <RouteError />,
  }))
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);
