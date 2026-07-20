// Cálculo e classificação de IMC por faixa etária.
// Espelho fiel de backend/imc.py — mesma entrada => mesma saída.

function toDate(value) {
  if (!value) return null;
  const m = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function calcularImc(peso, altura) {
  const p = Number(peso);
  const a = Number(altura);
  if (!Number.isFinite(p) || !Number.isFinite(a) || p <= 0 || a <= 0) return null;
  return Math.round((p / (a * a)) * 100) / 100;
}

export function idadeEm(dataNascimento, dataReferencia) {
  const nasc = toDate(dataNascimento);
  if (!nasc) return null;
  const ref = toDate(dataReferencia) || new Date();
  let anos = ref.getFullYear() - nasc.getFullYear();
  const antesDoAniversario =
    ref.getMonth() < nasc.getMonth() ||
    (ref.getMonth() === nasc.getMonth() && ref.getDate() < nasc.getDate());
  if (antesDoAniversario) anos -= 1;
  return anos >= 0 ? anos : null;
}

export function classificarImc(imc, idade) {
  if (imc === null || imc === undefined) return null;
  if (idade !== null && idade !== undefined && idade >= 60) {
    // Tabela específica para idosos (60+).
    if (imc <= 23) return "Baixo peso";
    if (imc < 28) return "Peso adequado (eutrofia)";
    if (imc < 30) return "Excesso de peso";
    return "Obesidade";
  }
  // Tabela para adultos.
  if (imc < 18.5) return "Baixo peso";
  if (imc < 25) return "Peso normal";
  if (imc < 30) return "Sobrepeso";
  if (imc < 35) return "Obesidade grau I";
  if (imc < 40) return "Obesidade grau II";
  return "Obesidade grau III";
}

export function avaliar(peso, altura, dataNascimento, dataAvaliacao) {
  const imc = calcularImc(peso, altura);
  const idade = idadeEm(dataNascimento, dataAvaliacao);
  const classificacao = classificarImc(imc, idade);
  return { imc, classificacao, idade };
}
