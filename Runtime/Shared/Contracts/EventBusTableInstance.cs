using System;
using System.Collections.Generic;
using System.Globalization;

namespace GameFramework
{
    public class EventBusTableInstance
    {
        private readonly Dictionary<string, object> _fields;

        public EventBusTableInstance(Dictionary<string, object> fields)
        {
            _fields = fields;
        }

        public string GetString(string columnName, string defaultValue)
        {
            if (TryGetFieldValue(columnName, out var value) && value != null)
            {
                if (value is string text)
                {
                    return text;
                }

                return value.ToString();
            }

            return defaultValue;
        }

        public int GetInt(string columnName, int defaultValue)
        {
            if (!TryGetFieldValue(columnName, out var value) || value == null)
            {
                return defaultValue;
            }

            switch (value)
            {
                case int intValue:
                    return intValue;
                case long longValue when longValue >= int.MinValue && longValue <= int.MaxValue:
                    return (int)longValue;
                case float floatValue:
                    return (int)floatValue;
                case double doubleValue:
                    return (int)doubleValue;
                case decimal decimalValue:
                    return (int)decimalValue;
                case string text when int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed):
                    return parsed;
                case IConvertible convertible:
                    try
                    {
                        return Convert.ToInt32(convertible, CultureInfo.InvariantCulture);
                    }
                    catch
                    {
                        return defaultValue;
                    }
                default:
                    return defaultValue;
            }
        }

        private bool TryGetFieldValue(string columnName, out object value)
        {
            value = null;
            if (_fields == null || string.IsNullOrEmpty(columnName))
            {
                return false;
            }

            if (_fields.TryGetValue(columnName, out value))
            {
                return true;
            }

            if (_fields.TryGetValue("payload", out var payloadObject) && payloadObject is IDictionary<string, object> payload)
            {
                return payload.TryGetValue(columnName, out value);
            }

            return false;
        }
    }
}
