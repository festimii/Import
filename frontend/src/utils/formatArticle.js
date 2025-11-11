export const formatArticleCode = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  const stringValue = String(value).trim();
  if (/^\d{1,6}$/.test(stringValue)) {
    return stringValue.padStart(6, "0");
  }

  return stringValue;
};

export const formatArticleLabel = (value, name) => {
  const formattedCode = formatArticleCode(value);
  const trimmedName = typeof name === "string" ? name.trim() : name;

  if (trimmedName && formattedCode) {
    const normalizedName = trimmedName.toLowerCase();
    const normalizedCode = String(formattedCode).toLowerCase();
    if (normalizedName.includes(normalizedCode)) {
      return trimmedName;
    }
    return `${trimmedName} (${formattedCode})`;
  }

  if (trimmedName) {
    return trimmedName;
  }

  if (formattedCode) {
    return formattedCode;
  }

  return "N/A";
};

export default formatArticleCode;
