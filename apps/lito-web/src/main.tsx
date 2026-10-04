import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from "react-router-dom";
import { AppProviders } from "./app/providers";
import { routes, type AppRoute } from "./app/routes";
import { RouteError } from "./app/route-error";
import { Layout } from "./shared/ui";

import "./shared/styles/index.css";

function createRoute(route: AppRoute, nested = false): RouteObject {
  const { Component, children } = route;
  const element = nested ? (
    <Component />
  ) : (
    <Layout>
      <Component />
    </Layout>
  );

  if (route.index)
    return {
      index: true,
      element,
      errorElement: <RouteError />,
    };

  return {
    path: route.path,
    element,
    errorElement: <RouteError />,
    children: children?.map((child) => createRoute(child, true)),
  };
}

const router = createBrowserRouter(routes.map((route) => createRoute(route)));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>
);
