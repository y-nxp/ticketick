import "server-only";

import QRCode from "qrcode";

/** PNG du QR d'un billet, pour l'e-mail et l'aperçu. */
export async function ticketQrPng(code: string): Promise<Buffer> {
  return QRCode.toBuffer(code, {
    type: "png",
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#2A2C30", light: "#FFFFFF" },
  });
}
