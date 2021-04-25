const OPEN_OBJECT = "{".charCodeAt(0);
const CLOSE_OBJECT = "}".charCodeAt(0);
const OPEN_ARRAY = "[".charCodeAt(0);
const CLOSE_ARRAY = "]".charCodeAt(0);
const COLON = ":".charCodeAt(0);
const COMMA = ",".charCodeAt(0);
const QUOTE = '"'.charCodeAt(0);
const WS = " ".charCodeAt(0);
const NL = "\n".charCodeAt(0);
const CR = "\r".charCodeAt(0);
const TAB = "\t".charCodeAt(0);

const TRUE = Buffer.from("true");
const FALSE = Buffer.from("false");
const NULL = Buffer.from("null");
const MINUS = "-".charCodeAt(0);
const ZERO = "0".charCodeAt(0);
const NINE = "9".charCodeAt(0);
const DOT = ".".charCodeAt(0);

const OBJECT_TYPE = 0;
const ARRAY_TYPE = 1;
const KEY_TYPE = 2;
const PRIMITIVE_TYPE = 3;

const INVALID_TYPE = 9999;

class YAJson {
  parse(data) {
    this.data = data;
    this.buf = data;
    if (typeof data === "string") {
      this.buf = Buffer.from(data);
    } else if (Buffer.isBuffer(data)) {
      this.buf = data;
      data = this.buf.toString("utf-8");
    } else {
      return null;
    }

    const stateStack = [
      {
        type: INVALID_TYPE,
        result: null,
      },
    ];
    this.top = 0;
    let openIndex = 0;
    let openedType = INVALID_TYPE;
    for (let i = 0; i < this.buf.length; ++i) {
      // console.log(i);
      // console.log(stateStack);
      // console.log(this.top);
      // console.log(openIndex);
      // console.log(this.buf.toString("utf-8", i, i + 1));
      switch (this.buf[i]) {
        case OPEN_OBJECT: {
          stateStack[++this.top] = {
            type: OBJECT_TYPE,
            result: null,
            openIndex,
          };
          openIndex = this.top;
          openedType = OBJECT_TYPE;
          break;
        }
        case OPEN_ARRAY: {
          stateStack[++this.top] = {
            type: ARRAY_TYPE,
            result: null,
            openIndex,
          };
          openIndex = this.top;
          openedType = ARRAY_TYPE;
          break;
        }
        case QUOTE: {
          ++i;
          const start = i;
          while (this.buf[i] !== QUOTE) {
            ++i;
          }
          // const str = this.buf.toString("utf-8", start, i);
          const str = data.slice(start, i);
          if (
            openedType === OBJECT_TYPE &&
            stateStack[this.top].type !== KEY_TYPE
          ) {
            stateStack[++this.top] = {
              type: KEY_TYPE,
              result: str,
              checkColon: false,
            };
          } else {
            stateStack[++this.top] = {
              type: PRIMITIVE_TYPE,
              result: str,
            };
          }
          break;
        }
        case CLOSE_OBJECT: {
          const result = {};
          for (let j = openIndex + 1; j <= this.top; j += 2) {
            const key = stateStack[j];
            const value = stateStack[j + 1];
            if (key.type !== KEY_TYPE || !key.checkColon) {
              throw new Error("Invalid (CLOSE_OBJECT)");
            }
            result[key.result] = value.result;
          }
          this.top = openIndex;
          stateStack[this.top].result = result;
          openIndex = stateStack[this.top].openIndex;
          openedType = stateStack[openIndex].type;
          break;
        }
        case CLOSE_ARRAY: {
          const result = [];
          for (let j = openIndex + 1; j <= this.top; ++j) {
            const value = stateStack[j];
            result.push(value.result);
          }
          this.top = openIndex;
          stateStack[this.top].result = result;
          openIndex = stateStack[this.top].openIndex;
          openedType = stateStack[openIndex].type;
          break;
        }
        case COLON: {
          if (stateStack[this.top].type === KEY_TYPE) {
            stateStack[this.top].checkColon = true;
            break;
          }
          throw new Error("COLON is expected.");
        }
        case COMMA: {
          if (
            (stateStack[this.top].type !== KEY_TYPE &&
              stateStack[this.top - 1].type === KEY_TYPE) ||
            stateStack[openIndex].type === ARRAY_TYPE
          ) {
            break;
          }
          throw new Error("COMMA is expected.");
        }
        case WS:
        case NL:
        case CR:
        case TAB:
          break;
        default: {
          if (this.buf[i] === MINUS) {
            ++i;
            const digit_result = this.parseDigit(i, stateStack);
            if (!digit_result) {
              throw new Error("Invalid number");
            }
            i = digit_result;
            stateStack[this.top].result = -stateStack[this.top].result;
            break;
          }
          const digit_result = this.parseDigit(i, stateStack);
          if (digit_result !== null) {
            i = digit_result;
          } else if (this.buf[i] === TRUE[0]) {
            for (let j = 1; j < TRUE.length; ++j) {
              if (this.buf[i + j] !== TRUE[j]) {
                throw Error("Invalid true");
              }
            }
            i += 3;
            stateStack[++this.top] = {
              type: PRIMITIVE_TYPE,
              result: true,
            };
          } else if (this.buf[i] === FALSE[0]) {
            for (let j = 1; j < FALSE.length; ++j) {
              if (this.buf[i + j] !== FALSE[j]) {
                throw Error("Invalid false");
              }
            }
            i += 4;
            stateStack[++this.top] = {
              type: PRIMITIVE_TYPE,
              result: false,
            };
          } else {
            for (let j = 0; j < NULL.length; ++j) {
              if (this.buf[i + j] !== NULL[j]) {
                throw Error("Invalid null");
              }
            }
            i += 3;
            stateStack[++this.top] = {
              type: PRIMITIVE_TYPE,
              result: null,
            };
          }
          break;
        }
      }
    }
    if (stateStack.length === 2) {
      return stateStack[1].result;
    }
    return null;
  }

  parseDigit(i, stateStack) {
    if (this.buf[i] === ZERO) {
      const start = i++;
      if (this.buf[i] === DOT) {
        ++i;
        while (this.buf[i] >= ZERO && this.buf[i] <= NINE) {
          ++i;
        }
        stateStack[++this.top] = {
          type: PRIMITIVE_TYPE,
          result: parseFloat(this.data.slice(start, i)),
        };
        --i;
      } else {
        stateStack[++this.top] = {
          type: PRIMITIVE_TYPE,
          result: 0,
        };
      }
    } else if (this.buf[i] > ZERO && this.buf[i] <= NINE) {
      const start = i;
      while (this.buf[i] >= ZERO && this.buf[i] <= NINE) {
        ++i;
      }
      if (this.buf[i] === DOT) {
        ++i;
        while (this.buf[i] >= ZERO && this.buf[i] <= NINE) {
          ++i;
        }
        stateStack[++this.top] = {
          type: PRIMITIVE_TYPE,
          result: parseFloat(this.data.slice(start, i)),
        };
      } else {
        stateStack[++this.top] = {
          type: PRIMITIVE_TYPE,
          result: parseFloat(this.data.slice(start, i)),
        };
      }
      --i;
    } else {
      return null;
    }
    return i;
  }
}

// const result = new YAJson().parse(
//   '{"key": "value", "key2": 1, "key3": 1.1, "key4": true, "key5": false, "key6": null}'
// );
// const result = new YAJson().parse('{"key": [1, 2, 3]}');

const fs = require("fs");
const data = fs.readFileSync("./citylots.json");

console.time("YAJson");

let result = new YAJson().parse(data.toString("utf-8"));

console.timeEnd("YAJson");

console.time("JSON.parse");

result = JSON.parse(data.toString("utf-8"));

console.timeEnd("JSON.parse");

// console.log(result);
