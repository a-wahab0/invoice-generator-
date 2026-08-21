/* ============================================================
   Invoice Gen — app.js
   Firebase Auth + Firestore for save/load, jsPDF for export.
   ============================================================ */

(function () {
  "use strict";

  // ---------- DOM references ----------
  const authScreen   = document.getElementById("authScreen");
  const appShell      = document.getElementById("appShell");
  const topbarRight   = document.getElementById("topbarRight");

  const authForm      = document.getElementById("authForm");
  const authEmail      = document.getElementById("authEmail");
  const authPassword   = document.getElementById("authPassword");
  const authError       = document.getElementById("authError");
  const authTitle        = document.getElementById("authTitle");
  const authSub            = document.getElementById("authSub");
  const authSubmitBtn        = document.getElementById("authSubmitBtn");
  const authToggle             = document.getElementById("authToggle");

  const invoiceList   = document.getElementById("invoiceList");
  const newInvoiceBtn = document.getElementById("newInvoiceBtn");

  const logoInput     = document.getElementById("logoInput");
  const fromField      = document.getElementById("fromField");
  const billToField     = document.getElementById("billToField");
  const invoiceNumber    = document.getElementById("invoiceNumber");
  const invoiceDate       = document.getElementById("invoiceDate");
  const dueDate             = document.getElementById("dueDate");
  const invoiceStatus        = document.getElementById("invoiceStatus");
  const itemsBody              = document.getElementById("itemsBody");
  const addItemBtn               = document.getElementById("addItemBtn");
  const notesField                 = document.getElementById("notesField");
  const termsField                  = document.getElementById("termsField");
  const currencySelect                = document.getElementById("currencySelect");
  const taxPct                          = document.getElementById("taxPct");
  const discountPct                       = document.getElementById("discountPct");
  const amountPaid                          = document.getElementById("amountPaid");

  const saveBtn        = document.getElementById("saveBtn");
  const downloadBtn    = document.getElementById("downloadBtn");
  const saveStatus     = document.getElementById("saveStatus");
  const previewSheet   = document.getElementById("previewSheet");
  const toastEl        = document.getElementById("toast");

  // ---------- App state ----------
  let authMode = "signin"; // or "signup"
  let currentUser = null;
  let currentDocId = null;      // Firestore doc id of the loaded invoice, or null = unsaved
  let logoDataUrl = null;
  let items = [];               // [{id, desc, qty, rate}]
  let itemSeq = 0;
  let savedInvoices = [];       // cache of the sidebar list

  // ---------- Helpers ----------
  function uid() { return "it_" + (++itemSeq) + "_" + Math.random().toString(36).slice(2, 7); }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function toMoney(n) {
    if (isNaN(n)) n = 0;
    return n.toFixed(2);
  }

  function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function formatDateHuman(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    if (!y) return "—";
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function showToast(msg, ms = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add("hidden"), ms);
  }

  // ---------- Auth UI ----------
  function renderAuthMode() {
    if (authMode === "signin") {
      authTitle.textContent = "Sign in";
      authSub.textContent = "Your invoices, saved securely to your account.";
      authSubmitBtn.textContent = "Sign in";
      authToggle.textContent = "Need an account? Create one";
    } else {
      authTitle.textContent = "Create your account";
      authSub.textContent = "Free — takes about ten seconds.";
      authSubmitBtn.textContent = "Create account";
      authToggle.textContent = "Already have an account? Sign in";
    }
    authError.textContent = "";
  }

  authToggle.addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    renderAuthMode();
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";
    authSubmitBtn.disabled = true;
    const email = authEmail.value.trim();
    const password = authPassword.value;
    try {
      if (authMode === "signin") {
        await auth.signInWithEmailAndPassword(email, password);
      } else {
        await auth.createUserWithEmailAndPassword(email, password);
      }
    } catch (err) {
      authError.textContent = friendlyAuthError(err);
    } finally {
      authSubmitBtn.disabled = false;
    }
  });

  function friendlyAuthError(err) {
    const code = err && err.code || "";
    if (code.includes("wrong-password") || code.includes("invalid-credential")) return "That email/password combination doesn't match.";
    if (code.includes("user-not-found")) return "No account with that email — try creating one.";
    if (code.includes("email-already-in-use")) return "That email is already registered — try signing in.";
    if (code.includes("weak-password")) return "Password should be at least 6 characters.";
    if (code.includes("invalid-email")) return "That email address doesn't look right.";
    return err.message || "Something went wrong. Please try again.";
  }

  function renderTopbar() {
    topbarRight.innerHTML = "";
    if (!currentUser) return;
    const span = document.createElement("span");
    span.textContent = currentUser.email;
    const btn = document.createElement("button");
    btn.textContent = "Log out";
    btn.addEventListener("click", () => auth.signOut());
    topbarRight.appendChild(span);
    topbarRight.appendChild(btn);
  }

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    renderTopbar();
    if (user) {
      authScreen.classList.add("hidden");
      appShell.classList.remove("hidden");
      resetFormToBlank();
      subscribeInvoiceList();
    } else {
      appShell.classList.add("hidden");
      authScreen.classList.remove("hidden");
      renderAuthMode();
      if (unsubscribeList) unsubscribeList();
      savedInvoices = [];
    }
  });

  // ---------- Line items ----------
  function addItem(data) {
    const item = Object.assign({ id: uid(), desc: "", qty: 1, rate: 0 }, data || {});
    items.push(item);
    renderItemsTable();
  }

  function removeItem(id) {
    items = items.filter((it) => it.id !== id);
    if (items.length === 0) addItem();
    renderItemsTable();
  }

  function renderItemsTable() {
    itemsBody.innerHTML = "";
    items.forEach((item) => {
      const tr = document.createElement("tr");
      tr.dataset.id = item.id;
      tr.innerHTML = `
        <td class="col-desc"><input type="text" class="it-desc" placeholder="Description of item/service" value="${escapeHtml(item.desc)}" /></td>
        <td class="col-qty"><input type="number" class="it-qty" min="0" step="1" value="${item.qty}" /></td>
        <td class="col-rate"><input type="number" class="it-rate" min="0" step="0.01" value="${item.rate}" /></td>
        <td class="col-amt">${currencySelect.value}${toMoney(item.qty * item.rate)}</td>
        <td class="col-del"><button type="button" class="row-del" title="Remove line" aria-label="Remove line">✕</button></td>
      `;
      tr.querySelector(".it-desc").addEventListener("input", (e) => { item.desc = e.target.value; renderPreview(); });
      tr.querySelector(".it-qty").addEventListener("input", (e) => { item.qty = parseFloat(e.target.value) || 0; renderAll(); });
      tr.querySelector(".it-rate").addEventListener("input", (e) => { item.rate = parseFloat(e.target.value) || 0; renderAll(); });
      tr.querySelector(".row-del").addEventListener("click", () => removeItem(item.id));
      itemsBody.appendChild(tr);
    });
  }

  addItemBtn.addEventListener("click", () => addItem());

  // ---------- Logo upload ----------
  logoInput.addEventListener("change", () => {
    const file = logoInput.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      showToast("Logo is too large — please use an image under 1.5MB.");
      logoInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      logoDataUrl = reader.result;
      renderPreview();
    };
    reader.readAsDataURL(file);
  });

  // ---------- Totals ----------
  function computeTotals() {
    const subtotal = items.reduce((sum, it) => sum + (it.qty * it.rate), 0);
    const discAmt = subtotal * ((parseFloat(discountPct.value) || 0) / 100);
    const taxableBase = subtotal - discAmt;
    const taxAmt = taxableBase * ((parseFloat(taxPct.value) || 0) / 100);
    const total = taxableBase + taxAmt;
    const paid = parseFloat(amountPaid.value) || 0;
    const balanceDue = total - paid;
    return { subtotal, discAmt, taxAmt, total, paid, balanceDue };
  }

  // ---------- Live preview ----------
  function renderPreview() {
    const cur = currencySelect.value;
    const t = computeTotals();
    const status = invoiceStatus.value;

    const logoHtml = logoDataUrl
      ? `<img class="pv-logo" src="${logoDataUrl}" alt="Business logo" />`
      : `<div class="pv-logo-placeholder">${escapeHtml((fromField.value.split("\n")[0] || "Your business"))}</div>`;

    const rowsHtml = items.map((it) => `
      <tr>
        <td>${escapeHtml(it.desc) || "<span style=\"color:#9aa0af\">Untitled item</span>"}</td>
        <td class="r">${it.qty}</td>
        <td class="r">${cur}${toMoney(it.rate)}</td>
        <td class="r">${cur}${toMoney(it.qty * it.rate)}</td>
      </tr>
    `).join("");

    previewSheet.innerHTML = `
      <div class="pv-stamp ${status}">${status}</div>
      <div class="pv-head">
        ${logoHtml}
        <div class="pv-title">
          <h2>INVOICE</h2>
          <div class="num">#${escapeHtml(invoiceNumber.value || "0001")}</div>
        </div>
      </div>

      <div class="pv-meta">
        <div class="pv-addr">
          <div class="label">From</div>
          ${escapeHtml(fromField.value) || "—"}
          <div class="label" style="margin-top:10px;">Bill to</div>
          ${escapeHtml(billToField.value) || "—"}
        </div>
        <div class="pv-dates">
          <div><span class="k">Date</span><span class="v">${formatDateHuman(invoiceDate.value)}</span></div>
          <div><span class="k">Due date</span><span class="v">${formatDateHuman(dueDate.value)}</span></div>
          <div><span class="k">Status</span><span class="v">${status}</span></div>
        </div>
      </div>

      <table class="pv-table">
        <thead>
          <tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="4" style="color:#9aa0af">No line items yet</td></tr>`}</tbody>
      </table>

      <div class="pv-totals">
        <div><span>Subtotal</span><span class="v">${cur}${toMoney(t.subtotal)}</span></div>
        ${parseFloat(discountPct.value) > 0 ? `<div><span>Discount (${discountPct.value}%)</span><span class="v">-${cur}${toMoney(t.discAmt)}</span></div>` : ""}
        ${parseFloat(taxPct.value) > 0 ? `<div><span>Tax (${taxPct.value}%)</span><span class="v">${cur}${toMoney(t.taxAmt)}</span></div>` : ""}
        <div class="grand"><span>Total</span><span class="v">${cur}${toMoney(t.total)}</span></div>
        ${t.paid > 0 ? `<div><span>Amount paid</span><span class="v">-${cur}${toMoney(t.paid)}</span></div>` : ""}
        <div class="due"><span>Balance due</span><span class="v">${cur}${toMoney(t.balanceDue)}</span></div>
      </div>

      <div class="pv-foot">
        ${notesField.value ? `<div class="col"><div class="label">Notes</div>${escapeHtml(notesField.value)}</div>` : ""}
        ${termsField.value ? `<div class="col"><div class="label">Terms</div>${escapeHtml(termsField.value)}</div>` : ""}
      </div>
    `;
  }

  function renderAll() {
    renderItemsTableAmountsOnly();
    renderPreview();
  }

  // cheap refresh of just the amount cells + preview, without losing input focus
  function renderItemsTableAmountsOnly() {
    items.forEach((item) => {
      const tr = itemsBody.querySelector(`tr[data-id="${item.id}"]`);
      if (!tr) return;
      tr.querySelector(".col-amt").textContent = `${currencySelect.value}${toMoney(item.qty * item.rate)}`;
    });
  }

  [fromField, billToField, invoiceNumber, invoiceDate, dueDate, invoiceStatus,
   notesField, termsField, currencySelect, taxPct, discountPct, amountPaid]
    .forEach((el) => el.addEventListener("input", renderAll));
  invoiceStatus.addEventListener("change", renderAll);
  currencySelect.addEventListener("change", renderAll);

  // ---------- Form <-> data object ----------
  function collectInvoiceData() {
    const t = computeTotals();
    return {
      invoiceNumber: invoiceNumber.value.trim() || "0001",
      invoiceDate: invoiceDate.value,
      dueDate: dueDate.value,
      status: invoiceStatus.value,
      from: fromField.value,
      billTo: billToField.value,
      notes: notesField.value,
      terms: termsField.value,
      currency: currencySelect.value,
      taxPct: parseFloat(taxPct.value) || 0,
      discountPct: parseFloat(discountPct.value) || 0,
      amountPaid: parseFloat(amountPaid.value) || 0,
      logoDataUrl: logoDataUrl || null,
      items: items.map((it) => ({ desc: it.desc, qty: it.qty, rate: it.rate })),
      subtotal: t.subtotal,
      total: t.total,
      balanceDue: t.balanceDue
    };
  }

  function loadInvoiceData(data) {
    invoiceNumber.value = data.invoiceNumber || "0001";
    invoiceDate.value = data.invoiceDate || todayISO();
    dueDate.value = data.dueDate || todayISO(14);
    invoiceStatus.value = data.status || "DRAFT";
    fromField.value = data.from || "";
    billToField.value = data.billTo || "";
    notesField.value = data.notes || "";
    termsField.value = data.terms || "";
    currencySelect.value = data.currency || "$";
    taxPct.value = data.taxPct || 0;
    discountPct.value = data.discountPct || 0;
    amountPaid.value = data.amountPaid || 0;
    logoDataUrl = data.logoDataUrl || null;
    items = (data.items && data.items.length ? data.items : [{ desc: "", qty: 1, rate: 0 }])
      .map((it) => Object.assign({ id: uid() }, it));
    renderItemsTable();
    renderPreview();
  }

  function resetFormToBlank() {
    currentDocId = null;
    loadInvoiceData({
      invoiceNumber: String(savedInvoices.length + 1).padStart(4, "0"),
      invoiceDate: todayISO(),
      dueDate: todayISO(14),
      status: "DRAFT",
      from: "",
      billTo: "",
      notes: "",
      terms: "",
      currency: "$",
      taxPct: 0,
      discountPct: 0,
      amountPaid: 0,
      logoDataUrl: null,
      items: [{ desc: "", qty: 1, rate: 0 }]
    });
    logoInput.value = "";
    saveStatus.textContent = "";
  }

  newInvoiceBtn.addEventListener("click", resetFormToBlank);

  // ---------- Firestore: save / list / load / delete ----------
  let unsubscribeList = null;

  function subscribeInvoiceList() {
    if (unsubscribeList) unsubscribeList();
    unsubscribeList = db.collection("invoices")
      .where("ownerId", "==", currentUser.uid)
      .orderBy("updatedAt", "desc")
      .onSnapshot((snap) => {
        savedInvoices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderInvoiceList();
      }, (err) => {
        console.error("List sync error:", err);
        showToast("Couldn't load saved invoices — check your connection.");
      });
  }

  function renderInvoiceList() {
    invoiceList.innerHTML = "";
    if (savedInvoices.length === 0) {
      invoiceList.innerHTML = `<p class="empty-note">No invoices yet. Build one and hit Save.</p>`;
      return;
    }
    savedInvoices.forEach((inv) => {
      const row = document.createElement("div");
      row.className = "invoice-row" + (inv.id === currentDocId ? " active" : "");
      row.innerHTML = `
        <div>
          <div class="num">#${escapeHtml(inv.invoiceNumber || "—")}</div>
          <div class="amt">${escapeHtml(inv.currency || "$")}${toMoney(inv.total || 0)} · ${escapeHtml(inv.status || "DRAFT")}</div>
        </div>
        <button type="button" class="del" title="Delete">🗑</button>
      `;
      row.addEventListener("click", (e) => {
        if (e.target.closest(".del")) return;
        currentDocId = inv.id;
        loadInvoiceData(inv);
        renderInvoiceList();
      });
      row.querySelector(".del").addEventListener("click", async () => {
        if (!confirm(`Delete invoice #${inv.invoiceNumber}? This can't be undone.`)) return;
        try {
          await db.collection("invoices").doc(inv.id).delete();
          if (currentDocId === inv.id) resetFormToBlank();
          showToast("Invoice deleted.");
        } catch (err) {
          console.error(err);
          showToast("Couldn't delete — please try again.");
        }
      });
      invoiceList.appendChild(row);
    });
  }

  saveBtn.addEventListener("click", async () => {
    if (!currentUser) return;
    const data = collectInvoiceData();
    if (!data.from.trim() && !data.billTo.trim()) {
      showToast("Add at least your business info or a client before saving.");
      return;
    }
    saveBtn.disabled = true;
    saveStatus.textContent = "Saving…";
    try {
      const payload = Object.assign({}, data, {
        ownerId: currentUser.uid,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (currentDocId) {
        await db.collection("invoices").doc(currentDocId).set(payload, { merge: true });
      } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const ref = await db.collection("invoices").add(payload);
        currentDocId = ref.id;
      }
      saveStatus.textContent = "Saved ✓";
      showToast("Invoice saved.");
    } catch (err) {
      console.error(err);
      saveStatus.textContent = "";
      showToast("Couldn't save — check your connection and Firebase setup.");
    } finally {
      saveBtn.disabled = false;
      setTimeout(() => { saveStatus.textContent = ""; }, 3000);
    }
  });

  // ---------- PDF export ----------
  // Built with jsPDF core drawing (no external plugin) for reliable,
  // predictable rendering — standard fonts only, so nothing can fail
  // to load or render as missing glyphs.
  function generatePDF() {
    const data = collectInvoiceData();
    const t = computeTotals();
    const cur = data.currency;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageW = 210;
    const marginX = 18;
    let y = 20;

    const INK = [22, 33, 58];
    const SLATE = [91, 100, 120];
    const RULE = [225, 220, 206];
    const STAMP = { DRAFT: [91, 100, 120], UNPAID: [178, 58, 46], PAID: [47, 107, 79] }[data.status] || [91, 100, 120];

    // ---- Header: logo/business name + "INVOICE" ----
    if (data.logoDataUrl) {
      try {
        const fmt = data.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(data.logoDataUrl, fmt, marginX, y - 4, 30, 18, undefined, "FAST");
      } catch (e) {
        console.warn("Logo could not be embedded:", e);
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...INK);
    doc.text("INVOICE", pageW - marginX, y + 2, { align: "right" });
    doc.setFont("courier", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text(`# ${data.invoiceNumber}`, pageW - marginX, y + 8, { align: "right" });

    // status stamp
    doc.setDrawColor(...STAMP);
    doc.setTextColor(...STAMP);
    doc.setLineWidth(0.6);
    doc.circle(pageW - marginX - 14, y + 28, 12, "S");
    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.text(data.status, pageW - marginX - 14, y + 29, { align: "center" });

    y += 22;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageW - marginX, y);
    y += 8;

    // ---- From / Bill To ----
    const colW = (pageW - marginX * 2 - 10) / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    doc.text("FROM", marginX, y);
    doc.text("BILL TO", marginX + colW + 10, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const fromLines = doc.splitTextToSize(data.from || "—", colW);
    const billLines = doc.splitTextToSize(data.billTo || "—", colW);
    doc.text(fromLines, marginX, y + 6);
    doc.text(billLines, marginX + colW + 10, y + 6);

    // ---- Dates (right aligned block) ----
    let dy = y;
    const dateColX = pageW - marginX;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    const dateRows = [
      ["Date", formatDateHuman(data.invoiceDate)],
      ["Due date", formatDateHuman(data.dueDate)]
    ];
    // (kept minimal; the on-screen preview shows the fuller date block)

    const bodyHeight = Math.max(fromLines.length, billLines.length) * 5;
    y += Math.max(bodyHeight, 12) + 12;

    // ---- Items table ----
    const tableTop = y;
    const cols = {
      desc: { x: marginX, w: 88, label: "Item" },
      qty:  { x: marginX + 88, w: 22, label: "Qty" },
      rate: { x: marginX + 110, w: 30, label: "Rate" },
      amt:  { x: marginX + 140, w: pageW - marginX - (marginX + 140), label: "Amount" }
    };

    doc.setFillColor(...INK);
    doc.rect(marginX, y, pageW - marginX * 2, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(cols.desc.label, cols.desc.x + 2, y + 5.5);
    doc.text(cols.qty.label, cols.qty.x + cols.qty.w - 2, y + 5.5, { align: "right" });
    doc.text(cols.rate.label, cols.rate.x + cols.rate.w - 2, y + 5.5, { align: "right" });
    doc.text(cols.amt.label, cols.amt.x + cols.amt.w - 2, y + 5.5, { align: "right" });
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const items_ = data.items.length ? data.items : [{ desc: "", qty: 0, rate: 0 }];

    items_.forEach((it, idx) => {
      const descLines = doc.splitTextToSize(it.desc || "Untitled item", cols.desc.w - 4);
      const rowH = Math.max(descLines.length * 4.6, 8);

      // page-break safety
      if (y + rowH > 275) {
        doc.addPage();
        y = 20;
      }

      doc.setTextColor(...INK);
      doc.text(descLines, cols.desc.x + 2, y + 5.2);
      doc.setFont("courier", "normal");
      doc.text(String(it.qty), cols.qty.x + cols.qty.w - 2, y + 5.2, { align: "right" });
      doc.text(`${cur}${toMoney(it.rate)}`, cols.rate.x + cols.rate.w - 2, y + 5.2, { align: "right" });
      doc.text(`${cur}${toMoney(it.qty * it.rate)}`, cols.amt.x + cols.amt.w - 2, y + 5.2, { align: "right" });
      doc.setFont("helvetica", "normal");

      y += rowH;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(marginX, y, pageW - marginX, y);
      y += 3.5;
    });

    y += 4;
    if (y > 250) { doc.addPage(); y = 20; }

    // ---- Totals block ----
    const totalsX = pageW - marginX - 70;
    const totalsW = 70;
    function totalRow(label, value, opts = {}) {
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(opts.size || 10);
      doc.setTextColor(...(opts.color || INK));
      doc.text(label, totalsX, y);
      doc.setFont("courier", opts.bold ? "bold" : "normal");
      doc.text(`${value}`, totalsX + totalsW, y, { align: "right" });
      y += opts.gap || 6;
    }

    totalRow("Subtotal", `${cur}${toMoney(t.subtotal)}`);
    if (data.discountPct > 0) totalRow(`Discount (${data.discountPct}%)`, `-${cur}${toMoney(t.discAmt)}`);
    if (data.taxPct > 0) totalRow(`Tax (${data.taxPct}%)`, `${cur}${toMoney(t.taxAmt)}`);

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.line(totalsX, y - 2, totalsX + totalsW, y - 2);
    totalRow("Total", `${cur}${toMoney(t.total)}`, { bold: true, size: 11.5 });
    if (t.paid > 0) totalRow("Amount paid", `-${cur}${toMoney(t.paid)}`);

    doc.setFillColor(243, 239, 228);
    doc.rect(totalsX - 4, y - 5, totalsW + 4, 9, "F");
    totalRow("Balance due", `${cur}${toMoney(t.balanceDue)}`, { bold: true, size: 11.5, gap: 10 });

    // ---- Notes / Terms ----
    if (data.notes || data.terms) {
      y += 4;
      if (y > 265) { doc.addPage(); y = 20; }
      const footColW = (pageW - marginX * 2 - 10) / 2;
      if (data.notes) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...SLATE);
        doc.text("NOTES", marginX, y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
        doc.text(doc.splitTextToSize(data.notes, footColW), marginX, y + 5);
      }
      if (data.terms) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...SLATE);
        doc.text("TERMS", marginX + footColW + 10, y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
        doc.text(doc.splitTextToSize(data.terms, footColW), marginX + footColW + 10, y + 5);
      }
    }

    // ---- Footer ----
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE);
      doc.text(`Invoice #${data.invoiceNumber}`, marginX, 289);
      doc.text(`Page ${p} of ${pageCount}`, pageW - marginX, 289, { align: "right" });
    }

    doc.save(`invoice-${data.invoiceNumber || "0001"}.pdf`);
  }

  downloadBtn.addEventListener("click", () => {
    if (items.every((it) => !it.desc && !it.qty && !it.rate)) {
      showToast("Add at least one line item first.");
      return;
    }
    try {
      generatePDF();
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed — please try again.");
    }
  });

  // ---------- Init ----------
  renderAuthMode();
})();
