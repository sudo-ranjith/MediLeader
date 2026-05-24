import { useState, useEffect, useCallback } from 'react';

export function useQuery<T = any>(sql: string, params: any[] = [], deps: any[] = []) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.dbSelect(sql, params);
      if ((result as any)?.error) {
        setError((result as any).error);
      } else {
        setData(result as T[]);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql, JSON.stringify(params)]);

  useEffect(() => {
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, ...deps]);

  return { data, loading, error, refetch };
}

export function useGet<T = any>(sql: string, params: any[] = [], deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.dbGet(sql, params);
      if ((result as any)?.error) {
        setError((result as any).error);
      } else {
        setData(result as T);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sql, JSON.stringify(params)]);

  useEffect(() => {
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, ...deps]);

  return { data, loading, error, refetch };
}

export async function dbSelect<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const result = await window.api.dbSelect(sql, params);
  if ((result as any)?.error) throw new Error((result as any).error);
  return result as T[];
}

export async function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const result = await window.api.dbGet(sql, params);
  if ((result as any)?.error) throw new Error((result as any).error);
  return result as T;
}

export async function dbRun(sql: string, params: any[] = []) {
  const result = await window.api.dbRun(sql, params);
  if (result?.error) throw new Error(result.error);
  return result;
}
