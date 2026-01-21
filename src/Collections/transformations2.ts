import { NativeSignal } from "../Core/NativeSignal";
import { BufferedSubscribable } from "../Sinks/BufferedSubscribable";
import { I_NativeCollection, ReqColTypes } from "./Collection";
import { Computed } from "../Core/Computed";
import { EventRef, I_GettableSubscribable, I_Subscribable, LinkedList, StatefulSubscribable, Subscribable } from "../Core/Subscribable";



// At its core we need to listen for events and react to them. All abstractions might be bloat here.