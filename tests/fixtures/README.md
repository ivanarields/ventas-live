# Fixtures de Testeo de IA

Este directorio contiene **datos de prueba** para validar la IA (comprobantes,
clasificación de imagen, parseo de notificaciones).

**Todo lo que corre contra estos fixtures usa un `user_id` de prueba aislado
(ver `tests/test-user.json`). NUNCA toca datos reales.**

---

## Estructura

```
tests/
├── test-user.json                    ← ID del usuario de prueba (generado)
└── fixtures/
    ├── receipts/                     ← 15 comprobantes reales
    │   ├── receipt_01.png
    │   ├── receipt_01.json           ← respuesta esperada
    │   ├── receipt_02.jpg
    │   ├── receipt_02.json
    │   └── ...
    ├── non-receipts/                 ← 5 imágenes que NO son comprobantes
    │   ├── clothing_01.jpg
    │   ├── clothing_01.json          ← { tipo: "PRENDA_ROPA" }
    │   └── ...
    └── notifications/                ← 10 textos de notificaciones bancarias
        ├── notif_01.json             ← incluye texto + esperado
        └── ...
```

---

## Convención de nombres

- **receipts/**: `receipt_NN.{png,jpg,jpeg,webp}` + `receipt_NN.json`
- **non-receipts/**: nombre descriptivo + `.json`
- **notifications/**: `notif_NN.json` (incluye el texto adentro)

---

## Formato del JSON esperado — Comprobantes

```json
{
  "es_comprobante": true,
  "pagador_esperado": "MARIA GARCIA",
  "monto_esperado": 120,
  "banco_esperado": "Yape",
  "confianza_minima": "media",
  "notas": "Yape directo, nombre completo visible"
}
```

**Regla:** solo se verifican los campos que aparecen. Fecha/hora normalmente no
se validan (cambian por screenshot).

## Formato del JSON esperado — No-comprobantes

```json
{
  "tipo_esperado": "PRENDA_ROPA",
  "categoria_esperada": "Blusas",
  "notas": "Blusa rosa manga corta"
}
```

## Formato del JSON esperado — Notificaciones

```json
{
  "texto": "MARIA, te envió Bs 50. Saldo disponible...",
  "app_package": "com.bcp.innovacxion.yapeapp",
  "expected": {
    "name": "MARIA",
    "amount": 50,
    "via": "regex|learned|gemini|manual_review"
  },
  "notas": "Yape directo con nombre corto"
}
```

---

## Cómo preparar los comprobantes reales (los 15 tuyos)

1. Juntá los 15 screenshots reales en una carpeta temporal
2. Renombralos `receipt_01.png`, `receipt_02.png`, etc.
3. Copialos a `tests/fixtures/receipts/`
4. Por cada uno, creá su `.json` con los datos esperados (lo que **debería**
   responder la IA — en MAYÚSCULAS, normalizado)
5. Si un dato es incierto (ej: no sabés si el banco es BCP o Unión), ponelo
   en `notas` y no lo incluyas en `expected`

---

## Reglas de seguridad

- ✅ Todos los tests corren bajo `user_id` de prueba (`tests/test-user.json`)
- ❌ Ningún script de test puede leer/escribir el `user_id` real
- ❌ Ninguna imagen de cliente real se debe subir a servicios externos sin
  consentimiento — los tests corren localmente
