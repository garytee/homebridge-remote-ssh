import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
} from "homebridge"
import ssh from "remote-ssh-exec"
import assign from "object-assign"

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * like this for example and used to access all exported variables and classes from HAP-NodeJS.
 */
let hap: HAP

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap
  api.registerAccessory("SSH", SshAccessory)
}

class SshAccessory implements AccessoryPlugin {
  private powerOn = false
  private readonly log: Logging
  private readonly name: string
  private readonly service: string
  private readonly onCommand: string
  private readonly offCommand: string
  private readonly stateCommand: string
  private readonly onValue: string
  private readonly exactMatch: string
  private readonly ssh: string
  private readonly switchService: Service
  private readonly informationService: Service

  private matchesString(match: string): boolean {
    if (this.exactMatch) {
      return match === this.onValue
    } else {
      return match.indexOf(this.onValue) > -1
    }
  }

  private setState = (
    powerOn: CharacteristicValue,
    callback: CharacteristicSetCallback
  ) => {
    var accessory = this as any
    var state = powerOn ? "on" : "off"
    var prop = state + "Command"
    var command = accessory[prop]
    var stream = ssh(command, accessory.ssh)
    stream.on("error", function (err: any) {
      accessory.log("Error: " + err)
      callback(
        err || new Error("Error setting " + accessory.name + " to " + state)
      )
    })
    stream.on("finish", function () {
      accessory.log("Set " + accessory.name + " to " + state)
      callback(undefined)
    })
  }

  private getState = (callback: CharacteristicGetCallback) => {
    var accessory = this
    var command = accessory["stateCommand"]
    var stream = ssh(command, accessory.ssh)
    stream.on("error", function (err: any) {
      accessory.log("Error: " + err)
      callback(err || new Error("Error getting state of " + accessory.name))
    })
    stream.on("data", function (data: any) {
      var state = data.toString("utf-8").trim().toLowerCase()
      accessory.log("State of " + accessory.name + " is: " + state)
      callback(undefined, accessory.matchesString(state))
    })
  }

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log
    this.service = "Switch"
    this.name = config["name"]
    this.onCommand = config["on"]
    this.offCommand = config["off"]
    this.stateCommand = config["state"]
    this.onValue = config["on_value"] || "playing"
    this.onValue = this.onValue.trim().toLowerCase()
    this.exactMatch = config["exact_match"] || true
    this.ssh = assign(
      {
        user: config["user"],
        host: config["host"],
        password: config["password"],
        key: config["key"],
      },
      config["ssh"]
    )
    this.switchService = new hap.Service.Switch(this.name)
    this.informationService = new hap.Service.AccessoryInformation()
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log("Identify!")
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    this.informationService
      .setCharacteristic(hap.Characteristic.Manufacturer, "SSH Manufacturer")
      .setCharacteristic(hap.Characteristic.Model, "SSH Model")
      .setCharacteristic(hap.Characteristic.SerialNumber, "SSH Serial Number")
    var characteristic = this.switchService
      .getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setState.bind(this))
    if (this.stateCommand) {
      characteristic.on(CharacteristicEventTypes.GET, this.getState.bind(this))
    }
    return [this.informationService, this.switchService]
  }
}