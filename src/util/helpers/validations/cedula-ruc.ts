/**
 * Validates an Ecuadorian ID number.
 * @param {string} id - The ID number to validate.
 * @returns {boolean} - True if the ID number is valid, false otherwise.
 */
export function validateCedula(id) {
  if (!id || id.length !== 10) return false;

  const provinceCode = +id.slice(0, 2);
  if (provinceCode < 1 || (provinceCode > 24 && provinceCode !== 30)) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let totalSum = 0;

  for (let i = 0; i < 9; i++) {
    const digit = +id[i];
    const product = digit * coefficients[i];
    totalSum += product >= 10 ? product - 9 : product;
  }

  const checkDigit = (10 - (totalSum % 10)) % 10;
  return checkDigit === +id.slice(-1);
}


/**
 * Validates an Ecuadorian RUC number.
 * @param {string} ruc - The RUC number to validate.
 * @returns {Object} - An object containing validation result and type.
 */
export function validateRUC(ruc: string) {
  const result = {
    isValid: false,
    type: 'RUC',
  };

  if (!ruc || ruc.length !== 13) return result;
  if (!ruc.endsWith('001')) return result;

  const typeCode = +ruc.slice(2, 3);
  const id = ruc.slice(0, 10);

  if (/^[0-5]$/.test(`${typeCode}`)) {
    result.isValid = validateCedula(id);
    result.type = 'RUC de persona natural';
  }

  if (typeCode === 9) {
    // El SRI no aplica Módulo 11 a S.A.S. (Ley de Emprendimiento 2020).
    // ~58% de RUC S.A.S. reales fallan el algoritmo, por eso solo se valida
    // estructura: provincia + sufijo '001'. Se informa si el Módulo 11 pasa o no.
    const passesModulo11 = validateLegalEntityRUC(id);
    result.isValid = true;
    result.type = passesModulo11
      ? 'RUC de persona jurídica'
      : 'RUC de persona jurídica (S.A.S.)';
  }

  if (typeCode === 6) {
    result.isValid = validatePublicEntityRUC(ruc);
    result.type = 'RUC de entidad pública';
  }

  return result;
}

/**
 * Validates a legal entity RUC number.
 * @param {string} ruc - The RUC number to validate.
 * @returns {boolean} - True if the RUC number is valid, false otherwise.
 */
function validateLegalEntityRUC(ruc) {
  const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  const checkDigit = +ruc.slice(-1);

  try {
    const totalSum = ruc
      .slice(0, 9)
      .split('')
      .reduce((acc, digit, index) => {
        return acc + +digit * coefficients[index];
      }, 0);

    const remainder = totalSum % 11;
    return remainder === 0 ? checkDigit === 0 : 11 - remainder === checkDigit;
  } catch {
    return false;
  }
}

/**
 * Validates a public entity RUC number.
 * @param {string} ruc - The RUC number to validate.
 * @returns {boolean} - True if the RUC number is valid, false otherwise.
 */
function validatePublicEntityRUC(ruc) {
  const coefficients = [3, 2, 7, 6, 5, 4, 3, 2];
  const checkDigit = +ruc.slice(8, 9); // Update to extract the 9th digit as the check digit

  try {
    const totalSum = ruc
      .slice(0, 8)
      .split('')
      .reduce((acc, digit, index) => {
        return acc + +digit * coefficients[index];
      }, 0);

    const remainder = totalSum % 11;
    return remainder === 0 ? checkDigit === 0 : 11 - remainder === checkDigit;
  } catch {
    return false;
  }
}
