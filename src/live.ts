// Pages reload what they show when the data behind it changes (another page saved a recipe, a price
// was entered...). Changes name topics ("recipes", "ingredients"...); "*" means everything.
import { useEffect, useRef } from "react";
import { onChange } from "./data/db";

export function useLive(topics: string[], reload: () => void) {
  const fn = useRef(reload);
  fn.current = reload;
  const key = topics.join(",");
  useEffect(() => {
    const wanted = key.split(",");
    return onChange((changed) => {
      if (changed.includes("*") || changed.some((t) => wanted.includes(t))) fn.current();
    });
  }, [key]);
}
