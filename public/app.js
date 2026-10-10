let waterChart = null;

function getStatusDetails(level) {
  if (level < 100) return { name: "Normal", class: "status-normal" };
  if (level < 150) return { name: "Alert", class: "status-alert" };
  return { name: "Danger", class: "status-danger" };
}

function initChart() {
  const ctx = document.getElementById("waterChart").getContext("2d");
  waterChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Water Level (cm)",
        data: [],
        borderColor: "#1976d2",
        backgroundColor: "rgba(25, 118, 210, 0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, suggestedMax: 200 } }
    }
  });
}

async function fetchSummary() {
  try {
    const res = await fetch("/api/summary");
    if (!res.ok) return;
    const summary = await res.json();
    document.getElementById("statAvg").textContent = `${summary.average} cm`;
    document.getElementById("statMinMax").textContent = `${summary.min} / ${summary.max} cm`;
    document.getElementById("statTrend").textContent = summary.trend.toUpperCase();
    const counts = summary.statusCounts;
    document.getElementById("statBreakdown").textContent = `N: ${counts.Normal} | A: ${counts.Alert} | D: ${counts.Danger}`;
  } catch (err) { console.error(err); }
}

async function fetchReadings() {
  try {
    const res = await fetch("/api/readings");
    if (!res.ok) return;
    const readings = await res.json();
    if (readings.length === 0) return;

    const latest = readings[0];
    const status = getStatusDetails(latest.waterLevelCm);

    document.getElementById("currentLevel").textContent = latest.waterLevelCm.toFixed(1);
    const badge = document.getElementById("statusBadge");
    badge.textContent = status.name;
    badge.className = `status-badge ${status.class}`;
    document.getElementById("lastUpdatedTime").textContent = new Date(latest.timestamp).toLocaleTimeString();

    const top10 = readings.slice(0, 10);
    document.getElementById("readingsTableBody").innerHTML = top10.map(r => {
      const st = getStatusDetails(r.waterLevelCm);
      return `<tr><td>${new Date(r.timestamp).toLocaleTimeString()}</td><td>${r.sensorId}</td><td><strong>${r.waterLevelCm} cm</strong></td><td><span class="status-badge ${st.class}" style="font-size:0.7rem; padding: 2px 8px;">${st.name}</span></td></tr>`;
    }).join("");

    const chartReadings = [...readings.slice(0, 20)].reverse();
    if (waterChart) {
      waterChart.data.labels = chartReadings.map(r => new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      waterChart.data.datasets[0].data = chartReadings.map(r => r.waterLevelCm);
      waterChart.update();
    }
  } catch (err) { console.error(err); }
}

async function generateAdvisory() {
  const advisoryBox = document.getElementById("advisoryBox");
  const btn = document.getElementById("generateAiBtn");
  btn.disabled = true;
  btn.textContent = "Generating AI Advisory...";
  try {
    const res = await fetch("/api/advisory", { method: "POST" });
    const data = await res.json();
    advisoryBox.textContent = data.advisory;
  } catch (err) {
    advisoryBox.textContent = "Error loading advisory.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate Advisory";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initChart();
  fetchReadings();
  fetchSummary();
  setInterval(() => { fetchReadings(); fetchSummary(); }, 5000);
  document.getElementById("generateAiBtn").addEventListener("click", generateAdvisory);
});