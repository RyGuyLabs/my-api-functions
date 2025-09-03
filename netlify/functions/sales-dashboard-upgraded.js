// sales-dashboard-upgraded.js

// =====================
// Data Simulation
// =====================
const salesData = {
    totalSales: 12450,
    totalOrders: 87,
    topProducts: [
        { name: "Product A", units: 35, revenue: 3500 },
        { name: "Product B", units: 22, revenue: 2200 },
        { name: "Product C", units: 15, revenue: 1500 }
    ],
    recentOrders: [
        { id: 1001, customer: "Alice", total: 120, date: "2025-09-01" },
        { id: 1002, customer: "Bob", total: 75, date: "2025-09-02" },
        { id: 1003, customer: "Charlie", total: 200, date: "2025-09-02" }
    ],
    salesTrends: [
        { date: "2025-08-28", sales: 1500 },
        { date: "2025-08-29", sales: 1200 },
        { date: "2025-08-30", sales: 1800 },
        { date: "2025-08-31", sales: 2000 },
        { date: "2025-09-01", sales: 1750 },
        { date: "2025-09-02", sales: 2200 }
    ]
};

// =====================
// Utility Functions
// =====================
function formatCurrency(amount) {
    return `$${amount.toLocaleString()}`;
}

function createElement(tag, className, innerText) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerText) el.innerText = innerText;
    return el;
}

// =====================
// Render Functions
// =====================
function renderSalesSummary(data) {
    const container = document.getElementById("sales-summary");
    container.innerHTML = ""; // Clear previous content

    const totalSalesEl = createElement("div", "summary-item", `Total Sales: ${formatCurrency(data.totalSales)}`);
    const totalOrdersEl = createElement("div", "summary-item", `Total Orders: ${data.totalOrders}`);

    container.appendChild(totalSalesEl);
    container.appendChild(totalOrdersEl);
}

function renderTopProducts(products) {
    const container = document.getElementById("top-products");
    container.innerHTML = "";

    products.forEach(product => {
        const item = createElement("div", "product-item");
        item.innerHTML = `<strong>${product.name}</strong> - Units Sold: ${product.units}, Revenue: ${formatCurrency(product.revenue)}`;
        container.appendChild(item);
    });
}

function renderRecentOrders(orders) {
    const container = document.getElementById("recent-orders");
    container.innerHTML = "";

    orders.forEach(order => {
        const item = createElement("div", "order-item");
        item.innerHTML = `#${order.id} - ${order.customer} - ${formatCurrency(order.total)} - ${order.date}`;
        container.appendChild(item);
    });
}

function renderSalesChart(trends) {
    const ctx = document.getElementById("sales-chart").getContext("2d");

    const labels = trends.map(d => d.date);
    const data = trends.map(d => d.sales);

    // Destroy previous chart instance if exists
    if (window.salesChartInstance) window.salesChartInstance.destroy();

    window.salesChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Daily Sales",
                data: data,
                fill: true,
                borderColor: "rgba(75, 192, 192, 1)",
                backgroundColor: "rgba(75, 192, 192, 0.2)",
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true }
            }
        }
    });
}

// =====================
// Initialization
// =====================
function initDashboard() {
    renderSalesSummary(salesData);
    renderTopProducts(salesData.topProducts);
    renderRecentOrders(salesData.recentOrders);
    renderSalesChart(salesData.salesTrends);
}

// Wait for DOM to load
document.addEventListener("DOMContentLoaded", initDashboard);
