const GAS_URL = import.meta.env.VITE_GAS_URL;

export async function gasGet() {
  if (!GAS_URL) throw new Error('VITE_GAS_URL が設定されていません。.env ファイルを確認してください。');
  const res = await fetch(GAS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function gasPost(action, data = {}) {
  if (!GAS_URL) throw new Error('VITE_GAS_URL が設定されていません。.env ファイルを確認してください。');
  // Content-Type: text/plain で CORS プリフライトを回避
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...data }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
