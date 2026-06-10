import { useEffect, useRef } from "react";

/**
 * Mantiene una conexión WebSocket autenticada con el backend.
 * Se reconecta automáticamente con backoff exponencial si la conexión cae.
 *
 * @param {(msg: object) => void} onMessage  Callback con el mensaje ya parseado.
 * @param {boolean} enabled  false para no conectar (ej: usuario no logueado).
 * @param {(ws: WebSocket) => void} [onOpen]  Se invoca en cada conexión
 *   (incluidas reconexiones) — útil para suscribirse a algo al conectar.
 */
export function useWebSocket(onMessage, enabled = true, onOpen) {
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const retryRef = useRef(null);

  // Mantener la referencia a los callbacks actualizada sin reconectar
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);

  useEffect(() => {
    if (!enabled) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const wsBase = apiUrl.replace(/^http/, "ws");
    let delay = 1000;
    let stopped = false;   // evita reconexiones "zombi" tras desmontar

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(`${wsBase}/ws?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data)); } catch {}
      };

      ws.onopen = () => {
        delay = 1000;
        onOpenRef.current?.(ws);
      };

      ws.onclose = () => {
        if (stopped) return;
        retryRef.current = setTimeout(() => {
          delay = Math.min(delay * 2, 30000);
          connect();
        }, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryRef.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;   // que el close del desmontaje no agende reconexión
        ws.close();
      }
    };
  }, [enabled]);

  return wsRef;
}
