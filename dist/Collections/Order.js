"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Order = exports.OrderNode = void 0;
var Subscribable_1 = require("../Core/Subscribable");
var BufferedSubscribable_1 = require("../Sinks/BufferedSubscribable");
var OrderNode = /** @class */ (function () {
    function OrderNode(value, order) {
        this.next = null;
        this.prev = null;
        this.value = value;
        this.order = order;
    }
    OrderNode.prototype._insertAfter = function (value) {
        if (this.next === null) {
            this.order.last = value;
        }
        value.next = this.next;
        value.prev = this;
        this.next = value;
    };
    OrderNode.prototype._insertBefore = function (value) {
        if (this.prev === null)
            this.order.first = value;
        value.prev = this.prev;
        value.next = this;
        this.prev = value;
    };
    OrderNode.prototype.insertAfter = function (value) {
        var node = this.order._createNode(value);
        this._insertAfter(node);
        this.order.on_change.emit({
            event: "add",
            value: this.value,
            node: this
        });
        this.order._on_change_instant.emit({
            event: "add",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.nodes);
        return node;
    };
    OrderNode.prototype.insertBefore = function (value) {
        var node = this.order._createNode(value);
        this._insertBefore(node);
        this.order.on_change.emit({
            event: "add",
            value: this.value,
            node: this
        });
        this.order._on_change_instant.emit({
            event: "add",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.nodes);
        return node;
    };
    /**
     * Move this node such that it is the next node after the reference node.
     * @param value
     */
    OrderNode.prototype.moveAfter = function (reference) {
        var prevNext = this.next;
        var prevPrev = this.prev;
        if (this.next)
            this.next.prev = this.prev;
        if (this.prev)
            this.prev.next = this.next;
        this.prev = reference;
        this.next = reference.next;
        reference.next = this;
        this.order.on_change.emit({
            event: "move",
            value: this,
            prevNext: prevNext,
            prevPrev: prevPrev
        });
        this.order._on_change_instant.emit({
            event: "move",
            value: this,
            prevNext: prevNext,
            prevPrev: prevPrev
        });
        this.order.emit(this.order.nodes);
        return this;
    };
    /**
     * Deletes the node from the order.
     * DO NOT REUSE THE NODE AFTERWARDS!
     * (There are no guardrails for performance reasons)
     */
    OrderNode.prototype.delete = function () {
        if (this.prev)
            this.prev.next = this.next;
        else
            this.order.first = this.next;
        if (this.next)
            this.next.prev = this.prev;
        else
            this.order.last = this.prev;
        this.next = null;
        this.prev = null;
        this.order.nodes.delete(this.value);
        this.order.on_change.emit({
            event: "delete",
            value: this.value,
            node: this
        });
        this.order._on_change_instant.emit({
            event: "delete",
            value: this.value,
            node: this
        });
        this.order.emit(this.order.nodes);
        this.order = null;
    };
    return OrderNode;
}());
exports.OrderNode = OrderNode;
var Order = /** @class */ (function (_super) {
    __extends(Order, _super);
    function Order() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.nodes = new Map();
        _this.first = null;
        _this.last = null;
        _this.on_change = new BufferedSubscribable_1.BufferedSubscribable();
        _this._on_change_instant = new Subscribable_1.Subscribable;
        return _this;
    }
    Order.prototype.get = function () {
        // TODO : Cache this! Clear cache on change.
        return __spreadArray([], this, true).map(function (v) { return v.value; });
    };
    Order.prototype._createNode = function (value) {
        var node = new OrderNode(value, this);
        this.nodes.set(value, node);
        if (!this.first)
            return this.first = this.last = node;
        return node;
    };
    Order.prototype._delete = function (value) {
        var node = this.nodes.get(value);
        node === null || node === void 0 ? void 0 : node.delete();
    };
    Order.prototype._add = function (value) {
        this.push(value);
    };
    Order.prototype.push = function (value) {
        var node = this._createNode(value);
        if (this.last !== node)
            this.last._insertAfter(node);
        this.on_change.emit({
            event: "add",
            value: node.value,
            node: node
        });
        this._on_change_instant.emit({
            event: "add",
            value: node.value,
            node: node
        });
        this.emit(this.nodes);
        return node;
    };
    Order.prototype.shift = function (value) {
        var node = this._createNode(value);
        if (this.first !== node)
            this.first._insertBefore(node);
        this.on_change.emit({
            event: "add",
            value: node.value,
            node: node
        });
        this._on_change_instant.emit({
            event: "add",
            value: node.value,
            node: node
        });
        this.emit(this.nodes);
        return node;
    };
    Order.prototype.getNode = function (value) {
        return this.nodes.get(value);
    };
    Order.prototype.size = function () {
        return this.nodes.size;
    };
    Order.prototype.clear = function () {
        var nodes = this.nodes;
        this.nodes = new Map();
        this.first = null;
        this.last = null;
        for (var _i = 0, _a = nodes.values(); _i < _a.length; _i++) {
            var node = _a[_i];
            this.on_change.emit({
                event: "delete",
                value: node.value,
                node: node
            });
            this._on_change_instant.emit({
                event: "delete",
                value: node.value,
                node: node
            });
        }
        this.emit(this.nodes);
    };
    Order.prototype[Symbol.iterator] = function () {
        var node;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    node = this.first;
                    _a.label = 1;
                case 1:
                    if (!node) return [3 /*break*/, 3];
                    return [4 /*yield*/, node];
                case 2:
                    _a.sent();
                    node = node.next;
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/];
            }
        });
    };
    return Order;
}(Subscribable_1.Subscribable));
exports.Order = Order;
