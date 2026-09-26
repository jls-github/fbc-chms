import { useState } from "react";
import { ApiError } from "./api";

/** Minimal form state: values, server-side field errors, and a submit wrapper. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key as string]) setErrors(({ [key as string]: _, ...rest }) => rest);
  };

  /** Binds a text-like input to a string field. */
  const bind = (key: keyof T & string) => ({
    id: key,
    name: key,
    value: (values[key] as string | null | undefined) ?? "",
    invalid: !!errors[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as T[typeof key]),
  });

  const handle = async (fn: () => Promise<unknown>) => {
    setFormError(null);
    setErrors({});
    try {
      await fn();
      return true;
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? "Invalid"])));
      }
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    }
  };

  return { values, setValues, set, bind, errors, formError, handle };
}
