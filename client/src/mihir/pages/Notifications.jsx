import React, { useState, useEffect } from "react";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Loading the list of notifications from the backend
  function loadNotifications() {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        setNotifications(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }

  // Loading once when the page first opens
  useEffect(() => {
    loadNotifications();
  }, []);

  // Marking one notification as read, then reload the list so it updates
  function markAsRead(id) {
    fetch(`/api/notifications/${id}/read`, { method: "PATCH" })
      .then((res) => res.json())
      .then(() => {
        loadNotifications();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  if (loading) {
    return (
      <div style={{ padding: "40px", color: "var(--text-secondary)" }}>
        Loading notifications...
      </div>
    );
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: "4px",
        }}
      >
        Notifications
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
        Alerts from your invoice activity.
      </p>

      {notifications.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          You have no notifications yet.
        </p>
      )}

      {notifications.map(function (note) {
        return (
          <div
            key={note.id}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderLeft: note.is_read
                ? "1px solid var(--border)"
                : "4px solid #3b82f6",
              borderRadius: "8px",
              padding: "16px 20px",
              marginBottom: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "var(--text-primary)",
                  fontWeight: note.is_read ? 400 : 600,
                }}
              >
                {note.message}
              </p>
              <div
                style={{
                  marginTop: "6px",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                To: {note.recipient}
                {note.invoice_link ? (
                  <a
                    href={note.invoice_link}
                    style={{ marginLeft: "12px", color: "#3b82f6" }}
                  >
                    View invoice
                  </a>
                ) : null}
              </div>
            </div>

            {!note.is_read && (
              <button
                onClick={() => markAsRead(note.id)}
                style={{
                  padding: "6px 12px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Mark as read
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
