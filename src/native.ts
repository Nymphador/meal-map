// Android-app-only behaviour. Everything here falls back to the browser's own way on a computer.
import { App } from "@capacitor/app";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
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

/** Opens the share sheet (Messages, Notes, email...). Returns false if there's no way to share here. */
export async function shareText(title: string, text: string): Promise<boolean> {
  try {
    if (isNative()) {
      await Share.share({ title, text, dialogTitle: title });
      return true;
    }
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ title, text });
      return true;
    }
  } catch {
    return true; // the user closed the share sheet
  }
  return false;
}

/** Saves a file somewhere the user picks: the share sheet on the phone (Drive, email, Files), a download on a computer. */
export async function shareFile(name: string, text: string, mime = "application/json") {
  if (isNative()) {
    await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    await Share.share({ title: name, files: [uri], dialogTitle: "Save the backup" });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
