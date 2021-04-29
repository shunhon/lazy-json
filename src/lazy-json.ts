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

type ParseResult<T> = {
  result: T;
  index: number;
};

class LazyJson {
  private data: string;
  private buf: Buffer;
  private skipMemoMap: number[] = [];
  private resultMemoMap: any[] = [];

  public constructor() {
    this.data = "";
    this.buf = Buffer.from("");
  }

  public parse(data: string | Buffer): any {
    if (typeof data === "string") {
      this.data = data;
      this.buf = Buffer.from(data);
    } else if (Buffer.isBuffer(data)) {
      this.buf = data;
      this.data = this.buf.toString("utf-8");
    } else {
      return null;
    }

    return this._parse(0);
  }

  private _parse(start: number) {
    for (let i = start; i < this.buf.length; ++i) {
      // console.log(i);
      // console.log(stateStack);
      // console.log(this.top);
      // console.log(openIndex);
      // console.log(this.buf.toString("utf-8", i, i + 1));
      switch (this.buf[i]) {
        case OPEN_OBJECT: {
          return this.parseObject(i).result;
        }
        case OPEN_ARRAY: {
          return this.parseArrayLazy(i).result;
        }
        case QUOTE: {
          return this.parseString(i).result;
        }
        default: {
          break;
        }
      }
    }
    return null;
  }

  private parseArray(index: number): ParseResult<any[]> {
    let sp = 0;
    const array: any[] = [];
    while (true) {
      switch (this.buf[++index]) {
        case OPEN_OBJECT: {
          const objectResult = this.parseObject(index);
          array[sp++] = objectResult.result;
          index = objectResult.index;
          break;
        }
        case OPEN_ARRAY: {
          const result = this.parseArray(index);
          array[sp++] = result.result;
          index = result.index;
          break;
        }
        case CLOSE_ARRAY: {
          return {
            result: array,
            index,
          };
        }
        case QUOTE: {
          const result = this.parseString(index);
          array[sp++] = result.result;
          index = result.index;
          break;
        }
      }
    }
  }

  private parseArrayLazy(index: number): ParseResult<any[]> {
    let sp = 0;
    let prevIndex = index + 1;
    const array: any[] = [];
    while (true) {
      switch (this.buf[++index]) {
        case OPEN_OBJECT: {
          index = this.skipObject(index);
          break;
        }
        case OPEN_ARRAY: {
          const result = this.parseArrayLazy(index);
          array[sp++] = result.result;
          index = result.index;
          break;
        }
        case CLOSE_ARRAY: {
          const startIndex = prevIndex;
          Object.defineProperty(array, sp++, {
            get: () => {
              if (this.resultMemoMap[startIndex] === undefined) {
                this.resultMemoMap[startIndex] = this._parse(startIndex);
              }
              return this.resultMemoMap[startIndex];
            },
            enumerable: true,
          });
          return {
            result: array,
            index,
          };
        }
        case QUOTE: {
          index = this.skipString(index);
          break;
        }
        case COMMA: {
          const startIndex = prevIndex;
          Object.defineProperty(array, sp++, {
            get: () => {
              console.log("Debug-COMMA");
              if (this.resultMemoMap[startIndex] === undefined) {
                this.resultMemoMap[startIndex] = this._parse(startIndex);
              }
              return this.resultMemoMap[startIndex];
            },
            enumerable: true,
          });
          prevIndex = index + 1;
          break;
        }
      }
    }
  }

  private parseObject(index: number) {
    let sp = -1;
    const openIndexStack: number[] = [];
    const result: { [key: string]: any } = {};
    while (true) {
      switch (this.buf[++index]) {
        case OPEN_OBJECT: {
          if (this.skipMemoMap[index] !== undefined) {
            index = this.skipMemoMap[index];
          } else {
            openIndexStack[++sp] = index;
          }
          break;
        }
        case CLOSE_OBJECT: {
          if (sp === -1) {
            return { index, result };
          }
          const openIndex = openIndexStack[sp--];
          this.skipMemoMap[openIndex] = index;
          break;
        }
        case QUOTE: {
          index = this.skipString(index);
          break;
        }
        case COLON: {
          if (sp === -1) {
            const keyIndex = this.parseKey(index);
            if (keyIndex === null) {
              throw Error();
            }
            const key = this.data.slice(keyIndex.start, keyIndex.end);
            const startIndex = index + 1;
            Object.defineProperty(result, key, {
              get: () => {
                if (this.resultMemoMap[startIndex] === undefined) {
                  this.resultMemoMap[startIndex] = this._parse(startIndex);
                }
                return this.resultMemoMap[startIndex];
              },
              enumerable: true,
            });
          }
        }
      }
    }
  }

  private skipObject(index: number) {
    let depth = 0;
    while (true) {
      switch (this.buf[++index]) {
        case OPEN_OBJECT: {
          ++depth;
          break;
        }
        case CLOSE_OBJECT: {
          if (depth === 0) {
            return index;
          }
          --depth;
          break;
        }
        case QUOTE: {
          index = this.skipString(index);
          break;
        }
      }
    }
  }

  private skipString(index: number) {
    ++index;
    while (this.buf[index] !== QUOTE) {
      ++index;
    }
    return index;
  }

  private parseString(index: number): ParseResult<string> {
    ++index;
    const start = index;
    while (this.buf[index] !== QUOTE) {
      ++index;
    }
    return { result: this.data.slice(start, index), index };
  }

  private parseBackString(index: number) {
    const end = index;
    --index;
    while (this.buf[index] !== QUOTE) {
      --index;
    }
    return {
      start: index + 1,
      end,
    };
  }

  private parseKey(index: number) {
    while (true) {
      switch (this.buf[--index]) {
        case QUOTE: {
          return this.parseBackString(index);
        }
        case WS:
        case NL:
        case CR:
        case TAB:
          break;
        default:
          return null;
      }
    }
  }
}

const fs = require("fs");
const data = fs.readFileSync("./citylots.json");
// const data = Buffer.from('{"a": [{"b": "test"}, "c"], "d": "e"}');
console.time("YAJson");

const lazyJson = new LazyJson();
let result = lazyJson.parse(data.toString("utf-8"));
// console.log(result.a);
// for (const feature of result.features) {
//   feature.type;
// }
// for (const feature of result.features) {
//   feature.type;
// }
console.log(result.features[0].type);

console.timeEnd("YAJson");

console.time("JSON.parse");

result = JSON.parse(data.toString("utf-8"));
// for (const feature of result.features) {
//   feature.type;
// }
// for (const feature of result.features) {
//   feature.type;
// }
console.log(result.features[0].type);

console.timeEnd("JSON.parse");

// console.log(result);
