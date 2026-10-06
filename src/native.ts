// Android-app-only behaviour. Everything here does nothing on the website.
import { App } from "@capacitor/app";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isNative } from "./api";

/** The phone's back button goes back a page, and leaves the app from the home screen. */
export function useAndroidBack() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!isNative()) return;
    const handle = App.addListener("backButton", ({ canGoBack }) => {
      if (location.pathname === "/") App.exitApp();
      else if (canGoBack) navigate(-1);
      else navigate("/");
    });
    return () => { handle.then((h) => h.remove()); };
  }, [location.pathname, navigate]);
}
