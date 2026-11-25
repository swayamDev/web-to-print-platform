import "server-only";

/**
 * Transactional email content (PRD p9 §13: order updates, proof status, completion alerts).
 * Plain, accessible HTML with a text alternative. Values are escaped.
 */

export type EmailContent = { subject: string; text: string; html: string };

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:20px 0"><a href="${esc(action.url)}" style="background:#ff4d00;color:#121212;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">${esc(action.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="en-GB"><body style="margin:0;background:#f4f2ed;font-family:Inter,Arial,sans-serif;color:#121212">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font:600 12px/1 monospace;letter-spacing:.14em;text-transform:uppercase;color:#5c5a55">Digital Heroes Print</p>
<h1 style="font-size:22px;margin:12px 0 16px">${esc(title)}</h1>${body}${button}
<p style="margin:24px 0 0;font-size:12px;color:#5c5a55">Demonstration platform: no real orders are fulfilled.</p>
</div></body></html>`;
}

export function orderConfirmedEmail(input: {
  customerName: string | null;
  orderNumber: string;
  invoiceNumber: string;
  summary: string;
  total: string;
  orderUrl: string;
}): EmailContent {
  const greeting = input.customerName ? `Hi ${input.customerName.split(" ")[0]},` : "Hi,";
  const paragraphs = [
    greeting,
    `Payment for order ${input.orderNumber} is confirmed.`,
    `${input.summary}. Total paid ${input.total} (invoice ${input.invoiceNumber}).`,
    "We will email you when your artwork proof is ready to review.",
  ];
  return {
    subject: `Order ${input.orderNumber} confirmed`,
    text: `${paragraphs.join("\n\n")}\n\nView your order: ${input.orderUrl}\n`,
    html: layout(`Order ${input.orderNumber} confirmed`, paragraphs, {
      label: "View your order",
      url: input.orderUrl,
    }),
  };
}

export function proofReadyEmail(input: {
  customerName: string | null;
  orderNumber: string;
  version: number;
  orderUrl: string;
}): EmailContent {
  const greeting = input.customerName ? `Hi ${input.customerName.split(" ")[0]},` : "Hi,";
  const paragraphs = [
    greeting,
    `Proof version ${input.version} for order ${input.orderNumber} is ready.`,
    "Check spelling, numbers, colours and position. Approve the proof or request changes.",
  ];
  const title = `Proof v${input.version} ready for order ${input.orderNumber}`;
  return {
    subject: title,
    text: `${paragraphs.join("\n\n")}\n\nReview your proof: ${input.orderUrl}\n`,
    html: layout(title, paragraphs, { label: "Review your proof", url: input.orderUrl }),
  };
}

export function proofApprovedEmail(input: {
  customerName: string | null;
  orderNumber: string;
  version: number;
  approvedAt: string;
  orderUrl: string;
}): EmailContent {
  const greeting = input.customerName ? `Hi ${input.customerName.split(" ")[0]},` : "Hi,";
  const paragraphs = [
    greeting,
    `You approved proof version ${input.version} for order ${input.orderNumber} on ${input.approvedAt}.`,
    "The approved proof is ready for staff to generate the production files.",
  ];
  const title = `Proof approved for order ${input.orderNumber}`;
  return {
    subject: title,
    text: `${paragraphs.join("\n\n")}\n\nView your order: ${input.orderUrl}\n`,
    html: layout(title, paragraphs, { label: "View your order", url: input.orderUrl }),
  };
}

export function orderInProductionEmail(input: {
  customerName: string | null;
  orderNumber: string;
  orderUrl: string;
}): EmailContent {
  const greeting = input.customerName ? `Hi ${input.customerName.split(" ")[0]},` : "Hi,";
  const paragraphs = [
    greeting,
    `Order ${input.orderNumber} has moved to production. Its print files are based on the approved proof.`,
    "We will let you know when it is complete.",
  ];
  const title = `Order ${input.orderNumber} is in production`;
  return {
    subject: title,
    text: `${paragraphs.join("\n\n")}\n\nView your order: ${input.orderUrl}\n`,
    html: layout(title, paragraphs, { label: "View your order", url: input.orderUrl }),
  };
}

export function orderCompletedEmail(input: {
  customerName: string | null;
  orderNumber: string;
  orderUrl: string;
}): EmailContent {
  const greeting = input.customerName ? `Hi ${input.customerName.split(" ")[0]},` : "Hi,";
  const paragraphs = [
    greeting,
    `Order ${input.orderNumber} has been marked complete.`,
    "You can download the invoice or reorder from the order page.",
  ];
  const title = `Order ${input.orderNumber} is complete`;
  return {
    subject: title,
    text: `${paragraphs.join("\n\n")}\n\nView your order: ${input.orderUrl}\n`,
    html: layout(title, paragraphs, { label: "View your order", url: input.orderUrl }),
  };
}

export function orderCancelledEmail(input: {
  customerName: string | null;
  orderNumber: string;
  reason: string;
  paid: boolean;
  orderUrl: string;
}): EmailContent {
  const greeting = input.customerName ? `Hi ${input.customerName.split(" ")[0]},` : "Hi,";
  const paragraphs = [
    greeting,
    `Order ${input.orderNumber} has been cancelled. Reason: ${input.reason}`,
    input.paid
      ? "A refund requires staff review. Contact us if you need help with your payment."
      : "Nothing was charged for this order.",
    "Reply to this email if you have any questions.",
  ];
  const title = `Order ${input.orderNumber} cancelled`;
  return {
    subject: title,
    text: `${paragraphs.join("\n\n")}\n\nView your order: ${input.orderUrl}\n`,
    html: layout(title, paragraphs, { label: "View your order", url: input.orderUrl }),
  };
}
