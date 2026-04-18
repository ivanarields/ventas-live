import { GoogleGenAI, Type } from "@google/genai";

export interface BankPayment {
  amount: number;
  time: string;
}

export interface ReconciliationResult {
  matches: boolean;
  bankPayments: BankPayment[];
  appPayments: any[];
  missingInApp: BankPayment[];
  extraInApp: any[];
  candidates: Candidate[];
}

export interface Candidate {
  customerId: string;
  name: string;
  score: number;
  reason: string;
  missingAmount: number;
}

export interface ImageData {
  data: string;
  mimeType: string;
}

export async function processBankScreenshots(images: ImageData[], targetDate: string): Promise<BankPayment[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada. Si has publicado la app, asegúrate de añadir la clave en los ajustes de entorno.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    Analiza estas capturas de pantalla de un extracto bancario.
    Extrae todos los abonos o transferencias recibidas de TODAS las imágenes, pero EXCLUSIVAMENTE las que correspondan a la fecha: ${targetDate}.
    
    Para cada transferencia de esa fecha específica, identifica:
    1. El monto (Bs)
    2. La hora (HH:mm)
    
    CRÍTICO: Si ves transacciones de otras fechas (como el día anterior o posterior), IGNÓRALAS por completo. Solo extrae las del ${targetDate}.
    
    Ignora saldos, nombres de bancos o textos irrelevantes.
    Devuelve exclusivamente un array JSON de objetos con las llaves "amount" (número) y "time" (string).
    Ejemplo: [{"amount": 20, "time": "14:30"}, {"amount": 50, "time": "15:15"}]
  `;

  try {
    const parts = images.map(img => ({
      inlineData: { mimeType: img.mimeType, data: img.data }
    }));
    parts.push({ text: prompt } as any);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: parts as any
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              time: { type: Type.STRING }
            },
            required: ["amount", "time"]
          }
        }
      }
    });

    const text = response.text?.trim();
    if (!text) return [];
    
    // Remove potential markdown code blocks if present
    const cleanJson = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Error in OCR:", error);
    throw error;
  }
}

export function reconcilePayments(
  bankPayments: BankPayment[],
  appPayments: any[],
  allCustomers: any[],
  allPedidos: any[]
): ReconciliationResult {
  // 1. Normalize and count frequencies
  const bankCounts: Record<number, number> = {};
  bankPayments.forEach(p => {
    bankCounts[p.amount] = (bankCounts[p.amount] || 0) + 1;
  });

  const appCounts: Record<number, number> = {};
  appPayments.forEach(p => {
    const amt = Number(p.pago);
    appCounts[amt] = (appCounts[amt] || 0) + 1;
  });

  // 2. Identify missing/extra
  const missingInApp: BankPayment[] = [];
  const extraInApp: any[] = [];

  // Find what's in bank but not in app
  const tempAppCounts = { ...appCounts };
  bankPayments.forEach(bp => {
    if (tempAppCounts[bp.amount] && tempAppCounts[bp.amount] > 0) {
      tempAppCounts[bp.amount]--;
    } else {
      missingInApp.push(bp);
    }
  });

  // Find what's in app but not in bank
  const tempBankCounts = { ...bankCounts };
  appPayments.forEach(ap => {
    const amt = Number(ap.pago);
    if (tempBankCounts[amt] && tempBankCounts[amt] > 0) {
      tempBankCounts[amt]--;
    } else {
      extraInApp.push(ap);
    }
  });

  const matches = missingInApp.length === 0 && extraInApp.length === 0;

  // 3. Scoring Candidates for missing payments
  const candidates: Candidate[] = [];
  
  if (missingInApp.length > 0) {
    const missingAmounts = Array.from(new Set(missingInApp.map(m => m.amount)));
    
    allCustomers.forEach(customer => {
      missingAmounts.forEach(amount => {
        let score = 0;
        let reasons: string[] = [];

        // Check if customer has an active order (PROCESAR or LISTO)
        const activePedidos = allPedidos.filter(ped => 
          (ped.customerId === customer.id || ped.customerName === customer.name) &&
          ['procesar', 'listo', 'preparado', 'verificado'].includes(ped.status.toLowerCase())
        );

        if (activePedidos.length > 0) {
          score += 50;
          reasons.push("Tiene pedidos activos");
        }

        // Check if customer has paid this amount before
        const history = appPayments.filter(p => p.customerId === customer.id || p.nombre === customer.name);
        const paidThisAmountBefore = history.some(p => Number(p.pago) === amount);
        
        if (paidThisAmountBefore) {
          score += 30;
          reasons.push(`Suele pagar montos de Bs ${amount}`);
        }

        // Frequency check
        if (history.length > 5) {
          score += 10;
          reasons.push("Cliente frecuente");
        }

        // Penalty if already paid today (less likely to pay twice, but not impossible)
        const paidToday = appPayments.some(p => (p.customerId === customer.id || p.nombre === customer.name));
        if (paidToday) {
          score -= 20;
        }

        if (score > 0) {
          candidates.push({
            customerId: customer.id,
            name: customer.name,
            score,
            reason: reasons.join(", "),
            missingAmount: amount
          });
        }
      });
    });
  }

  // Sort candidates by score
  candidates.sort((a, b) => b.score - a.score);

  return {
    matches,
    bankPayments,
    appPayments,
    missingInApp,
    extraInApp,
    candidates: candidates.slice(0, 10) // Top 10 candidates
  };
}
