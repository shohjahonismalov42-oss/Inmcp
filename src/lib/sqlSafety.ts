export function isSafeReadOnlySql(rawSql: string): {
  safe: boolean;
  reason?: string;
} {
  const trimmed = rawSql.trim();
  if (!trimmed) {
    return { safe: false, reason: "SQL so'rovi bo'sh bo'lishi mumkin emas." };
  }

  // Strip trailing single semicolon if present
  const withoutTrailingSemi = trimmed.replace(/;+\s*$/, '');
  if (withoutTrailingSemi.includes(';')) {
    return {
      safe: false,
      reason: "Xavfsizlik: faqat bitta SQL so'roviga ruxsat beriladi (ko'p buyruqli ';' taqiqlangan).",
    };
  }

  const upper = withoutTrailingSemi.toUpperCase();
  if (
    !upper.startsWith('SELECT ') &&
    !upper.startsWith('WITH ') &&
    !upper.startsWith('PRAGMA ')
  ) {
    return {
      safe: false,
      reason: "db_sql faqat o'qish (SELECT, WITH, PRAGMA) so'rovlarini bajaradi. Yozish uchun db_save yoki db_delete dan foydalaning.",
    };
  }

  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|VACUUM)\b/i;
  if (forbidden.test(withoutTrailingSemi)) {
    return {
      safe: false,
      reason: "Xavfsizlik: ma'lumotlarni o'zgartiruvchi SQL kalit so'zlari taqiqlangan.",
    };
  }

  return { safe: true };
}
