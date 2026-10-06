import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { openDb } from "./data/db";
import { initPhotos, readData, writeData } from "./data/storage";
import { useAndroidBack } from "./native";
import { seedIfNeeded } from "./server/settings";
import { applyTheme } from "./theme";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import "./index.css";
import ImportRecipe from "./pages/ImportRecipe";
import IngredientPage from "./pages/IngredientPage";
import Ingredients from "./pages/Ingredients";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeEditor from "./pages/RecipeEditor";
import RecipePrices from "./pages/RecipePrices";
import Recipes from "./pages/Recipes";
import SettingsPage from "./pages/Settings";

function App() {
  useAndroidBack();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/recipes" replace />} />
        <Route path="recipes" element={<Recipes />} />
        <Route path="recipes/new" element={<RecipeEditor />} />
        <Route path="recipes/import" element={<ImportRecipe />} />
        <Route path="recipes/:id" element={<RecipeDetail />} />
        <Route path="recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="recipes/:id/prices" element={<RecipePrices />} />
        <Route path="ingredients" element={<Ingredients />} />
        <Route path="ingredients/:id" element={<IngredientPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/recipes" replace />} />
      </Route>
    </Routes>
  );
}

applyTheme();

// The data is loaded from the phone before anything shows, so every page can read it straight away.
async function boot() {
  openDb(await readData(), writeData);
  await initPhotos();
  seedIfNeeded();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

boot().catch((e) => {
  console.error(e);
  document.getElementById("root")!.textContent = `Meal Planner couldn't load its data: ${(e as Error).message}`;
});
