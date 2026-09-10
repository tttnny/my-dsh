// node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.3/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  if (a === b) return true;
  if (!strict && isNullable(a) && isNullable(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (!a || !b) return false;
  function check(test, then) {
    return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
  }
  return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
    if (a2.byteLength !== b2.byteLength) return false;
    const viewA = new Uint8Array(a2);
    const viewB = new Uint8Array(b2);
    for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
    return true;
  }) ?? Object.keys({
    ...a,
    ...b
  }).every((key) => deepEqual(a[key], b[key], strict));
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/.pnpm/@deepseek-ai+schemastery@3.18.2/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
var resolvers = {};
Schema.extend = function extend(type, resolve3) {
  resolvers[type] = resolve3;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// node_modules/.pnpm/@deepseek-ai+dsh-home-paths@0.1.5-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-home-paths/lib/index.js
import { homedir } from "node:os";
import { basename, dirname, join, resolve as resolve2 } from "node:path";
var DSH_HOME_DIR_NAME = ".dsh";
var DEFAULT_DSH_HOME_DISPLAY = `~/${DSH_HOME_DIR_NAME}`;
var DSH_HOME_ENV = "DSH_HOME";
function defaultDshHome() {
  return join(homedir(), DSH_HOME_DIR_NAME);
}
function expandHomePath(path2) {
  if (path2 === "~") return homedir();
  if (path2.startsWith("~/") || path2.startsWith("~\\")) return join(homedir(), path2.slice(2));
  return path2;
}
function resolveDshHome(configured, env = process.env) {
  const fromEnv = env[DSH_HOME_ENV];
  return resolve2(expandHomePath(configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())));
}
function dshHomePath(...segments) {
  return join(resolveDshHome(), ...segments);
}

// src/server/config.ts
import * as fs from "node:fs/promises";
var MAX_CONCURRENCY = 100;
var AI_TIMEOUT_MIN = 500;
var AI_TIMEOUT_MAX = 12e4;
var SETTINGS_NAMESPACE = "dsh-chat-translate";
var DEFAULT_CONFIG = {
  enabled: true,
  concurrency: 3,
  timeoutMs: 2e3,
  aiTimeoutMs: 3e4,
  aiEnabled: true,
  bingEnabled: true,
  baseUrl: "",
  model: "",
  targetLang: "zh-Hans"
};
var ConfigManager = class {
  scope;
  credentials;
  constructor(scope, credentials) {
    this.scope = scope;
    this.credentials = credentials;
  }
  getConfig() {
    return this.scope.get();
  }
  /** Whether the AI channel has every required piece: baseUrl, model and key. */
  isAiConfigured() {
    const config = this.getConfig();
    return Boolean(
      config.baseUrl.trim() && config.model.trim() && this.credentials.getApiKey()
    );
  }
  onConfigChange(listener) {
    return this.scope.watch(listener);
  }
  /**
   * Merge a partial update into the settings namespace. Values are sanitized
   * here (bounds, trimming) so the schema's own constraints act as a second
   * line of defence rather than the only one.
   *
   * @internal Test-only. No production path calls this: the host writes the
   * settings namespace from the browser through the DSH settings service, and
   * this facade is only driven by `scripts/test-*.mjs` (regression suite).
   * Kept (with this marker) so those tests keep exercising the sanitizer.
   */
  async updateConfig(partial) {
    await this.scope.update(sanitizePatch({ ...partial }));
    return this.getConfig();
  }
};
function sanitizePatch(input) {
  const next = {};
  if (typeof input.enabled === "boolean") next.enabled = input.enabled;
  if (typeof input.aiEnabled === "boolean") next.aiEnabled = input.aiEnabled;
  if (typeof input.bingEnabled === "boolean") next.bingEnabled = input.bingEnabled;
  if (typeof input.concurrency === "number" && Number.isFinite(input.concurrency)) {
    next.concurrency = Math.min(Math.max(Math.round(input.concurrency), 1), MAX_CONCURRENCY);
  }
  if (typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)) {
    next.timeoutMs = Math.min(Math.max(Math.round(input.timeoutMs), 500), 1e4);
  }
  if (typeof input.aiTimeoutMs === "number" && Number.isFinite(input.aiTimeoutMs)) {
    next.aiTimeoutMs = Math.min(
      Math.max(Math.round(input.aiTimeoutMs), AI_TIMEOUT_MIN),
      AI_TIMEOUT_MAX
    );
  }
  if (typeof input.baseUrl === "string") next.baseUrl = input.baseUrl.trim();
  if (typeof input.model === "string") next.model = input.model.trim();
  if (typeof input.targetLang === "string" && input.targetLang.trim()) {
    next.targetLang = input.targetLang.trim();
  }
  return next;
}
async function migrateLegacyConfigFile(settings, legacyPath) {
  let raw;
  try {
    raw = await fs.readFile(legacyPath, "utf-8");
  } catch {
    return false;
  }
  let legacy;
  try {
    legacy = JSON.parse(raw);
  } catch {
    await fs.unlink(legacyPath).catch(() => {
    });
    return false;
  }
  if (typeof legacy !== "object" || legacy === null || Array.isArray(legacy)) {
    await fs.unlink(legacyPath).catch(() => {
    });
    return false;
  }
  const record = legacy;
  const descriptor = settings.describe().find((d) => d.ns === SETTINGS_NAMESPACE);
  if (descriptor?.user !== void 0) {
    await fs.unlink(legacyPath).catch(() => {
    });
    return false;
  }
  const patch = sanitizePatch(record);
  if (Object.keys(patch).length === 0) {
    await fs.unlink(legacyPath).catch(() => {
    });
    return false;
  }
  try {
    await settings.update(SETTINGS_NAMESPACE, patch);
  } catch (err) {
    console.warn("[dsh-chat-translate] Legacy config migration failed; will retry on next boot:", err);
    return false;
  }
  await fs.unlink(legacyPath).catch((err) => {
    console.warn("[dsh-chat-translate] Failed to remove legacy config file:", err);
  });
  return true;
}

// src/server/credentials.ts
var TRANSLATE_API_KEY_REF = "TRANSLATE_API_KEY";
var CredentialsReader = class {
  service;
  cachedKey = "";
  refreshing = null;
  constructor(service) {
    this.service = service;
  }
  /** Load the API key once; safe to call multiple times. */
  async init() {
    await this.refresh();
  }
  /**
   * Re-read the key from the credentials service. Used at startup and on
   * `credentials/reference-updated` events so an external edit or a write
   * from another surface takes effect immediately.
   */
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const resolved = await this.service.resolve(TRANSLATE_API_KEY_REF);
        this.cachedKey = (resolved?.value ?? "").trim();
      } catch (err) {
        console.warn("[dsh-chat-translate] Failed to resolve TRANSLATE_API_KEY:", err);
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
  /** Synchronous cached read — the hot translation path stays sync. */
  getApiKey() {
    return this.cachedKey;
  }
  /**
   * Status-only view of the ref (plaintext never crosses the wire).
   *
   * @internal Test-only. The settings UI reads key status through the
   * `credentials` Remote API with its own client-side shape, so nothing in
   * `src/` calls this host-side method; only `scripts/test-*.mjs` do.
   */
  async describe() {
    try {
      const info = await this.service.describe(TRANSLATE_API_KEY_REF);
      return { configured: info.configured, writable: info.writable };
    } catch {
      return { configured: false, writable: false };
    }
  }
  /** Write (or clear) the ref through the DSH credentials service. */
  async setApiKey(apiKey) {
    const normalized = apiKey.trim();
    if (normalized) {
      await this.service.set(TRANSLATE_API_KEY_REF, normalized);
    } else {
      await this.service.unset(TRANSLATE_API_KEY_REF);
    }
    this.cachedKey = normalized;
    await this.refresh();
  }
};

// src/server/cache.ts
import * as fs2 from "node:fs/promises";
import * as path from "node:path";
var TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var LruDiskCache = class {
  cache = /* @__PURE__ */ new Map();
  maxEntries;
  filePath;
  saveTimer = null;
  dirty = false;
  /** Legacy root-level cache file (<=1.1); moved under the plugin subdir. */
  legacyPath;
  constructor(maxEntries = 1e3) {
    this.maxEntries = maxEntries;
    this.filePath = dshHomePath("dsh-chat-translate", "cache.json");
    this.legacyPath = dshHomePath("dsh-chat-translate-cache.json");
  }
  async init() {
    let readPath = this.filePath;
    try {
      await fs2.access(this.filePath);
      await fs2.unlink(this.legacyPath).catch(() => {
      });
    } catch {
      try {
        await fs2.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs2.rename(this.legacyPath, this.filePath);
        readPath = this.filePath;
      } catch {
        readPath = this.legacyPath;
      }
    }
    try {
      const content = await fs2.readFile(readPath, "utf-8");
      const obj = JSON.parse(content);
      if (obj && typeof obj === "object") {
        for (const [k, raw] of Object.entries(obj)) {
          if (typeof raw === "string") {
            this.cache.set(k, { t: 0, v: raw });
          } else if (raw && typeof raw === "object" && typeof raw.v === "string") {
            const entry = raw;
            if (typeof entry.t === "number" && Number.isFinite(entry.t)) {
              this.cache.set(k, entry);
            }
          }
        }
      }
    } catch {
    }
    if (readPath !== this.filePath) {
      await fs2.unlink(this.legacyPath).catch(() => {
      });
    }
  }
  get(key) {
    const entry = this.cache.get(key);
    if (entry === void 0) return void 0;
    if (entry.t > 0 && Date.now() - entry.t > TTL_MS) {
      this.cache.delete(key);
      return void 0;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.v;
  }
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== void 0) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { t: Date.now(), v: value });
    this.dirty = true;
    this.scheduleSave();
  }
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        this.flush().catch((err) => {
          console.warn("[dsh-chat-translate] Failed to flush cache to disk:", err);
        });
      }
    }, 5e3);
  }
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    try {
      const obj = {};
      for (const [k, v] of this.cache.entries()) {
        obj[k] = v;
      }
      await fs2.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs2.writeFile(tmpPath, JSON.stringify(obj, null, 2), "utf-8");
      await fs2.rename(tmpPath, this.filePath);
      this.dirty = false;
    } catch (err) {
      console.warn("[dsh-chat-translate] Failed to write cache file atomically:", err);
      try {
        await fs2.unlink(tmpPath);
      } catch {
      }
      if (this.dirty) {
        this.scheduleSave();
      }
    }
  }
  async dispose() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) {
      await this.flush();
    }
  }
};

// src/describe-error.ts
function describeError(err) {
  if (err === null || err === void 0) return String(err);
  const parts = [];
  const push2 = (s) => {
    const t = String(s || "").trim();
    if (t && !parts.includes(t)) parts.push(t);
  };
  const head = err.message || String(err);
  push2(head);
  const headCode = err.code;
  if (headCode && !head.includes(headCode)) push2("[" + headCode + "]");
  let cause = err.cause;
  for (let depth = 0; cause && depth < 4; depth++) {
    const label = cause.message || String(cause);
    push2(cause.code && !label.includes(cause.code) ? label + " [" + cause.code + "]" : label);
    if (Array.isArray(cause.errors)) {
      for (const sub of cause.errors.slice(0, 3)) {
        if (sub) push2(sub.code || sub.message || String(sub));
      }
    }
    cause = cause.cause;
  }
  return parts.join(" \u2190 ");
}

// src/server/adapters/bing.ts
var TRANSLATOR_URL = "https://cn.bing.com/translator";
var TRANSLATE_URL = "https://cn.bing.com/ttranslatev3?isVertical=1&&IG={IG}&IID=translator.5025.1";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var IG_RES = [
  /_IG="([a-zA-Z0-9]+)"/,
  /,IG:"([a-zA-Z0-9]+)"/,
  /IG:"([a-zA-Z0-9]+)"/,
  /"IG":"([a-zA-Z0-9]+)"/
];
var ABUSE_RES = [
  /params_AbusePreventionHelper\s*=\s*\[\s*(\d+)\s*,\s*"([^"]+)"/,
  /var\s+params_AbusePreventionHelper\s*=\s*\[\s*(\d+)\s*,\s*"([^"]+)"/
];
var cachedTokens = null;
var tokensFetchedAt = 0;
var TOKEN_TTL_MS = 15 * 60 * 1e3;
var inFlightTokenPromise = null;
function parseTokens(html) {
  let ig;
  for (const re of IG_RES) {
    const m = re.exec(html);
    if (m && m[1]) {
      ig = m[1];
      break;
    }
  }
  let key;
  let token;
  for (const re of ABUSE_RES) {
    const m = re.exec(html);
    if (m && m[1] && m[2]) {
      key = m[1];
      token = m[2];
      break;
    }
  }
  if (!ig || !key || !token) {
    throw new Error(`Bing translator page: missing tokens (ig: ${!!ig}, key: ${!!key}, token: ${!!token})`);
  }
  return { ig, key, token };
}
async function fetchTokens(signal, forceRefresh = false) {
  if (!forceRefresh && cachedTokens && Date.now() - tokensFetchedAt < TOKEN_TTL_MS) {
    return cachedTokens;
  }
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }
  inFlightTokenPromise = (async () => {
    try {
      const response = await fetch(TRANSLATOR_URL, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        signal
      });
      if (!response.ok) {
        throw new Error(`Bing translator page responded with status ${response.status}`);
      }
      const html = await response.text();
      const tokens = parseTokens(html);
      cachedTokens = tokens;
      tokensFetchedAt = Date.now();
      return tokens;
    } finally {
      inFlightTokenPromise = null;
    }
  })();
  return inFlightTokenPromise;
}
var BingWebAdapter = class {
  id = "bing";
  name = "\u5FAE\u8F6F Bing \u7F51\u9875\u7FFB\u8BD1 (\u514DKey\u76F4\u8FDE)";
  isAvailable(_config) {
    return true;
  }
  async translate(text, signal, config) {
    const targetLang = config.targetLang || "zh-Hans";
    return this.executeTranslate(text, signal, targetLang, false);
  }
  async executeTranslate(text, signal, targetLang, isRetry) {
    const tokens = await fetchTokens(signal, isRetry);
    const body = new URLSearchParams({
      fromLang: "auto-detect",
      text,
      to: targetLang,
      key: tokens.key,
      token: tokens.token,
      tryFetchingGenderDebiasedTranslations: "true"
    });
    const response = await fetch(TRANSLATE_URL.replace("{IG}", tokens.ig), {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Referer: "https://cn.bing.com/translator/",
        Origin: "https://cn.bing.com",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body,
      signal
    });
    if (!response.ok) {
      cachedTokens = null;
      if (!isRetry && (response.status === 400 || response.status === 401 || response.status === 403)) {
        return this.executeTranslate(text, signal, targetLang, true);
      }
      throw new Error(`Bing translate responded with status ${response.status}`);
    }
    const json = await response.json();
    const translated = json?.[0]?.translations?.[0]?.text?.trim();
    if (!translated) {
      cachedTokens = null;
      if (!isRetry) {
        return this.executeTranslate(text, signal, targetLang, true);
      }
      throw new Error("Bing translate returned an empty result");
    }
    return translated;
  }
};

// src/server/adapters/openai.ts
var LANG_HINTS = {
  "zh-hans": "Simplified Chinese",
  "zh-cn": "Simplified Chinese",
  "zh": "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
  "zh-hant": "Traditional Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  ru: "Russian",
  pt: "Portuguese",
  it: "Italian"
};
var OpenAiCompatibleAdapter = class {
  id = "openai";
  name = "OpenAI \u517C\u5BB9 (Chat Completions)";
  credentials;
  constructor(credentials) {
    this.credentials = credentials;
  }
  isAvailable(config) {
    return Boolean(
      config.aiEnabled && config.baseUrl?.trim() && config.model?.trim() && this.credentials.getApiKey()
    );
  }
  async translate(text, signal, config) {
    const apiKey = this.credentials.getApiKey();
    if (!apiKey) {
      throw new Error(`TRANSLATE_API_KEY is not configured in ~/.dsh/.credentials.yaml`);
    }
    const baseUrl = (config.baseUrl || "").trim().replace(/\/+$/, "");
    const model = (config.model || "").trim();
    if (!baseUrl || !model) {
      throw new Error("OpenAI channel: baseUrl or model is not configured");
    }
    const langName = LANG_HINTS[(config.targetLang || "zh-Hans").toLowerCase()] || config.targetLang || "Simplified Chinese";
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the user's message into ${langName}. Output ONLY the translated text \u2014 no explanations, no quotation marks, no extra words. Preserve every placeholder like __DSH_MASK_0__ exactly as-is.`
          },
          { role: "user", content: text }
        ]
      }),
      signal
    });
    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || errBody?.message || "";
      } catch {
      }
      throw new Error(`OpenAI-compatible API responded with ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const translated = typeof content === "string" ? content.trim() : "";
    if (!translated) {
      throw new Error("OpenAI-compatible API returned empty content");
    }
    return translated;
  }
};

// src/server/pipeline/masking.ts
var ContentMaskingPipeline = class {
  mask(text) {
    if (!text || typeof text !== "string") {
      return {
        maskedText: text,
        unmask: (t) => t
      };
    }
    const masks = [];
    const addMask = (match) => {
      const idx = masks.length;
      masks.push(match);
      return `__DSH_MASK_${idx}__`;
    };
    let processed = text;
    processed = processed.replace(/(?:```|~~~)[\s\S]*?(?:```|~~~)/g, (m) => addMask(m));
    processed = processed.replace(/`[^`\n]+`/g, (m) => addMask(m));
    processed = processed.replace(/https?:\/\/[^\s)\];,;"'<>]+/g, (m) => addMask(m));
    processed = processed.replace(
      /(?:(?:\/|[a-zA-Z]:[\\\/]|\.\.?[\\\/])[\w.\-\\\/]+|\b(?:[\w.\-]+\/)+[\w.\-]+\.[a-zA-Z0-9]+\b|\b[\w.\-]+\.(?:ts|tsx|js|jsx|json|ya?ml|md|py|go|rs|c|cpp|h|hpp|css|scss|html|sh|bash|mjs|cjs|toml|lock|log|env|svg|png|jpe?g|gif|tar|gz|zip|xml|sql)\b)/g,
      (m) => addMask(m)
    );
    processed = processed.replace(
      /(?<=^|[\s(\[{"'])((?:--[a-zA-Z0-9_\-]+(?:=[^\s"'<>]+)?)|(?:-[a-zA-Z0-9]+))(?=[\s)\]}",:;!?]|$)/g,
      (m) => addMask(m)
    );
    const unmask = (translatedText) => {
      if (!translatedText || masks.length === 0) {
        return translatedText;
      }
      return translatedText.replace(
        /__\s*DSH\s*_\s*MASK\s*_\s*(\d+)\s*__/gi,
        (_fullMatch, indexStr) => {
          const idx = parseInt(indexStr, 10);
          if (!Number.isNaN(idx) && idx >= 0 && idx < masks.length) {
            return masks[idx];
          }
          return _fullMatch;
        }
      );
    };
    return {
      maskedText: processed,
      unmask
    };
  }
};

// src/server/dispatcher.ts
var TranslationDispatcher = class {
  configManager;
  cache;
  credentials;
  masking = new ContentMaskingPipeline();
  adapters = /* @__PURE__ */ new Map();
  circuitStates = /* @__PURE__ */ new Map();
  inFlightMap = /* @__PURE__ */ new Map();
  activeCount = 0;
  queue = [];
  constructor(configManager, cache, credentials) {
    this.configManager = configManager;
    this.cache = cache;
    this.credentials = credentials ?? { getApiKey: () => "" };
    this.registerAdapter(new OpenAiCompatibleAdapter(this.credentials));
    this.registerAdapter(new BingWebAdapter());
    this.configManager.onConfigChange(() => {
      this.processNext();
    });
  }
  registerAdapter(adapter) {
    this.adapters.set(adapter.id, adapter);
  }
  /**
   * Decide which channels are active for the current config, in priority order.
   *
   * Truth table (user contract):
   *  - AI on + configured + Bing on        -> [openai, bing]  (AI first, Bing fallback)
   *  - AI on + NOT configured + Bing on    -> [bing]
   *  - AI on + NOT configured + Bing off   -> []              (no translation)
   *  - AI off + Bing on                    -> [bing]
   *  - AI off + Bing off                   -> []              (no translation)
   */
  computeChannels(config) {
    const channels = [];
    for (const [id, adapter] of this.adapters) {
      if (id === "openai") {
        if (config.aiEnabled && config.baseUrl?.trim() && config.model?.trim() && this.credentials.getApiKey()) {
          channels.push(id);
        }
        continue;
      }
      if (id === "bing") {
        if (config.bingEnabled) channels.push(id);
        continue;
      }
      if (adapter.isAvailable(config)) channels.push(id);
    }
    return channels;
  }
  async translateBatch(texts, forceRefresh = false) {
    return Promise.all(texts.map((t) => this.translateOne(t, forceRefresh)));
  }
  async translateOne(rawText, forceRefresh = false) {
    const text = rawText.trim();
    if (!text) {
      return { original: rawText, translated: rawText, channel: "none", cached: true };
    }
    const config = this.configManager.getConfig();
    if (!config.enabled) {
      return { original: rawText, translated: rawText, channel: "disabled", cached: true };
    }
    const cacheKey = text.toLowerCase();
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return { original: rawText, translated: cached, channel: "cache", cached: true };
      }
    }
    if (!forceRefresh) {
      const inFlight = this.inFlightMap.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }
    }
    const { maskedText, unmask } = this.masking.mask(text);
    const taskPromise = this.enqueueTask(async () => {
      const currentConfig = this.configManager.getConfig();
      const channels = this.computeChannels(currentConfig);
      for (const chId of channels) {
        const adapter = this.adapters.get(chId);
        if (!adapter || !adapter.isAvailable(currentConfig) || this.isCircuitOpen(chId)) {
          continue;
        }
        try {
          const timeout = chId === "openai" ? currentConfig.aiTimeoutMs || 3e4 : currentConfig.timeoutMs || 2e3;
          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), timeout);
          let translatedMasked = "";
          try {
            translatedMasked = await adapter.translate(maskedText, abortCtrl.signal, currentConfig);
          } finally {
            clearTimeout(timer);
          }
          const cleaned = translatedMasked?.trim();
          if (cleaned && cleaned.length > 0) {
            const finalTranslated = unmask(cleaned);
            this.recordSuccess(chId);
            this.cache.set(cacheKey, finalTranslated);
            return {
              original: rawText,
              translated: finalTranslated,
              channel: chId,
              cached: false
            };
          }
          this.recordFailure(chId);
          console.warn(
            `[dsh-chat-translate] channel ${chId} returned an empty translation | text: ${text.slice(0, 60)}`
          );
        } catch (err) {
          this.recordFailure(chId);
          console.warn(
            `[dsh-chat-translate] channel ${chId} failed: ${describeError(err)} | text: ${text.slice(0, 60)}`
          );
        }
      }
      return { original: rawText, translated: rawText, channel: "fallback", cached: false };
    });
    if (!forceRefresh) {
      this.inFlightMap.set(cacheKey, taskPromise);
    }
    try {
      return await taskPromise;
    } finally {
      if (!forceRefresh) {
        this.inFlightMap.delete(cacheKey);
      }
    }
  }
  async testChannel(channelId) {
    const adapter = this.adapters.get(channelId);
    const config = this.configManager.getConfig();
    if (!adapter) {
      return { ok: false, latencyMs: 0, error: `Channel ${channelId} not found` };
    }
    if (!adapter.isAvailable(config)) {
      return { ok: false, latencyMs: 0, error: `Channel ${channelId} is not configured or disabled` };
    }
    const testText = "List files in current directory";
    const start = Date.now();
    try {
      const timeout = channelId === "openai" ? Math.min(config.aiTimeoutMs || 3e4, 3e4) : 4e3;
      const abortCtrl = new AbortController();
      const timer = setTimeout(() => abortCtrl.abort(), timeout);
      let res = "";
      try {
        res = await adapter.translate(testText, abortCtrl.signal, config);
      } finally {
        clearTimeout(timer);
      }
      const latencyMs = Date.now() - start;
      if (res && res.trim()) {
        return { ok: true, latencyMs };
      }
      return { ok: false, latencyMs, error: "Empty translation returned" };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: describeError(err) };
    }
  }
  enqueueTask(task) {
    return new Promise((resolve3, reject) => {
      const exec = async () => {
        this.activeCount++;
        try {
          const result = await task();
          resolve3(result);
        } catch (err) {
          reject(err);
        } finally {
          this.activeCount--;
          this.processNext();
        }
      };
      const maxConcurrency = Math.min(
        Math.max(this.configManager.getConfig().concurrency || 3, 1),
        MAX_CONCURRENCY
      );
      if (this.activeCount < maxConcurrency) {
        exec();
      } else {
        this.queue.push(exec);
      }
    });
  }
  processNext() {
    const maxConcurrency = Math.min(
      Math.max(this.configManager.getConfig().concurrency || 3, 1),
      MAX_CONCURRENCY
    );
    while (this.queue.length > 0 && this.activeCount < maxConcurrency) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
  isCircuitOpen(channelId) {
    let state = this.circuitStates.get(channelId);
    if (!state) return false;
    if (state.state === "open") {
      if (Date.now() >= state.openUntil) {
        state.state = "half-open";
        state.probeInFlight = true;
        return false;
      }
      return true;
    }
    if (state.state === "half-open") {
      if (state.probeInFlight) return true;
      state.probeInFlight = true;
      return false;
    }
    return false;
  }
  recordSuccess(channelId) {
    const state = this.circuitStates.get(channelId);
    if (state) {
      state.state = "closed";
      state.failureCount = 0;
      state.openUntil = 0;
      state.probeInFlight = false;
    }
  }
  recordFailure(channelId) {
    let state = this.circuitStates.get(channelId);
    if (!state) {
      state = { state: "closed", failureCount: 0, openUntil: 0, probeInFlight: false };
      this.circuitStates.set(channelId, state);
    }
    if (state.state === "half-open") {
      state.state = "open";
      state.failureCount = 3;
      state.openUntil = Date.now() + 3e4;
      state.probeInFlight = false;
      return;
    }
    state.failureCount++;
    if (state.failureCount >= 3) {
      state.state = "open";
      state.openUntil = Date.now() + 3e4;
    }
  }
};

// src/server/router.ts
var MAX_BODY_BYTES = 1024 * 1024;
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json)
  });
  res.end(json);
}
function readBody(req) {
  return new Promise((resolve3, reject) => {
    const chunks = [];
    let totalLength = 0;
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalLength += buf.length;
      if (totalLength > MAX_BODY_BYTES) {
        if (typeof req.destroy === "function") {
          req.destroy();
        }
        reject(new Error("Request body exceeded maximum allowed size (1MB)"));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve3(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
function createHttpHandler(configManager, dispatcher) {
  return async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const pathParts = url.pathname.split("/").filter(Boolean);
    const endpoint = pathParts[2] || "";
    try {
      if (endpoint === "translate" && req.method === "POST") {
        const raw = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(raw || "{}");
        } catch {
          sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
          return;
        }
        const rawTexts = parsed.texts !== void 0 ? parsed.texts : parsed.text;
        let texts = [];
        if (Array.isArray(rawTexts)) {
          texts = rawTexts.filter((t) => typeof t === "string");
        } else if (typeof rawTexts === "string") {
          texts = [rawTexts];
        }
        const forceRefresh = Boolean(parsed.forceRefresh);
        if (texts.length === 0) {
          sendJson(res, 200, { ok: true, results: [] });
          return;
        }
        const results = await dispatcher.translateBatch(texts, forceRefresh);
        sendJson(res, 200, { ok: true, results });
        return;
      }
      if (endpoint === "test-channel" && req.method === "POST") {
        const raw = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(raw || "{}");
        } catch {
          sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
          return;
        }
        const channelId = typeof parsed.channel === "string" ? parsed.channel : "";
        const result = await dispatcher.testChannel(channelId);
        sendJson(res, 200, result);
        return;
      }
      sendJson(res, 404, { ok: false, error: "Endpoint not found" });
    } catch (err) {
      const status = err?.message?.includes("exceeded maximum allowed size") ? 413 : 500;
      sendJson(res, status, { ok: false, error: describeError(err) });
    }
  };
}

// src/index.ts
var name = "dsh-chat-translate";
var inject = ["webServer", "settings", "credentials"];
var CONFIG_SCHEMA = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled),
  concurrency: Schema.number().min(1).max(MAX_CONCURRENCY).default(DEFAULT_CONFIG.concurrency),
  timeoutMs: Schema.number().min(500).max(1e4).default(DEFAULT_CONFIG.timeoutMs),
  aiTimeoutMs: Schema.number().min(AI_TIMEOUT_MIN).max(AI_TIMEOUT_MAX).default(DEFAULT_CONFIG.aiTimeoutMs),
  aiEnabled: Schema.boolean().default(DEFAULT_CONFIG.aiEnabled),
  bingEnabled: Schema.boolean().default(DEFAULT_CONFIG.bingEnabled),
  baseUrl: Schema.string().default(DEFAULT_CONFIG.baseUrl),
  model: Schema.string().default(DEFAULT_CONFIG.model),
  targetLang: Schema.string().default(DEFAULT_CONFIG.targetLang)
});
function apply(ctx) {
  const credentials = new CredentialsReader(ctx.credentials);
  const configManager = new ConfigManager(ctx.settings.register(SETTINGS_NAMESPACE, CONFIG_SCHEMA), credentials);
  const cache = new LruDiskCache(1e3);
  const dispatcher = new TranslationDispatcher(configManager, cache, credentials);
  const legacyConfigPath = dshHomePath("dsh-chat-translate-config.json");
  const initPromise = Promise.all([
    credentials.init(),
    cache.init(),
    migrateLegacyConfigFile(ctx.settings, legacyConfigPath)
  ]).catch((err) => {
    console.warn("[dsh-chat-translate] Initialization error:", err);
  });
  ctx.on("credentials/reference-updated", (ref) => {
    if (ref === TRANSLATE_API_KEY_REF) {
      void credentials.refresh();
    }
  });
  const webServer = ctx.webServer || (ctx.get ? ctx.get("webServer") : null);
  if (webServer && typeof webServer.register === "function") {
    const rawHandler = createHttpHandler(configManager, dispatcher);
    const handler = async (req, res) => {
      await initPromise;
      return rawHandler(req, res);
    };
    ctx.effect(
      () => {
        const unregister = webServer.register({
          kind: "prefix",
          path: "/api/dsh-chat-translate",
          handler
        });
        return () => {
          if (typeof unregister === "function") {
            unregister();
          }
          cache.dispose().catch((err) => {
            console.warn("[dsh-chat-translate] Dispose cache error:", err);
          });
        };
      },
      "dsh-chat-translate: translation API routes"
    );
  }
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
