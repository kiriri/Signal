import { NativeSignal } from "../Core/NativeSignal.js";
import { BufferedSubscribable } from "../Sinks/BufferedSubscribable.js";
import { I_NativeCollection, ReqColTypes } from "./Collection.js";
import { Computed } from "../Core/Computed.js";
import { EventRef, I_GettableSubscribable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable.js";



// At its core we need to listen for events and react to them. All abstractions might be bloat here.