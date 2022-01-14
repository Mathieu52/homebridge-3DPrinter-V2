import { Service, PlatformAccessory, CharacteristicValue} from 'homebridge';
import SerialPort = require('serialport');
const Readline = SerialPort.parsers.Readline;

SerialPort.parsers = {
  ByteLength: require('@serialport/parser-byte-length'),
  CCTalk: require('@serialport/parser-cctalk'),
  Delimiter: require('@serialport/parser-delimiter'),
  Readline: require('@serialport/parser-readline'),
  Ready: require('@serialport/parser-ready'),
  Regex: require('@serialport/parser-regex'),
};

import { PrinterHomebridgePlatform } from './platform';
import { getFirmwareByName} from './GCode';


enum FDMEvent {
    IDLE,
    PRINTING,
    EMERGENCY,
}

/**
 * Platform Accessoryrs
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class FDM_Printer {
  private hotEnd: Service;
  private heatedBed: Service;
  private fan: Service;
  //private statefulSwitch: Service;

  //private stateSwitch : Service[];

  private port: SerialPort;

  private FirwareGCode;

  private temperatureDisplayUnits = 0;

  public static HEATING_COLLING_STATE_TOLERANCE = 1.0;
  public static DEFAULT_HOTEND_MAXIMUM_TEMPERATURE = 400.0;
  public static DEFAULT_HEATED_BED_MAXIMUM_TEMPERATURE = 100.0;

  public static DEFAULT_PORT = '/dev/cu.URT1';
  public static DEFAULT_BAUDRATE = 115200;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */

  private HotEnd = {
    Temperature: 0,
    TargetTemperature: 0,
    CurrentHeatingCoolingState: 0,
    MaximumTemperature: 400,
  };

  private HeatedBed = {
    Temperature: 0,
    TargetTemperature: 0,
    CurrentHeatingCoolingState: 0,
    MaximumTemperature: 100,
  };

  private Fan = {
    On: false,
    Rotation_Speed: 0,
  };

  private PrintInfo = {
    Progress: 0,
    Elapsed_Time: 0,
  };

  private Main = {
    On: false,
    async getOn(): Promise<CharacteristicValue> {
      return this.On;
    },
    async setOn(value : CharacteristicValue) {
      this.On = value as boolean;
    },
    state: FDMEvent.IDLE,
    async getIDLE(): Promise<CharacteristicValue> {
      return this.state === FDMEvent.IDLE;
    },
    async getPRINTING(): Promise<CharacteristicValue> {
      return this.state === FDMEvent.PRINTING;
    },
    async getEMERGENCY(): Promise<CharacteristicValue> {
      return this.state === FDMEvent.EMERGENCY;
    },
  };

  private Test = {
    switchEvent: this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
    async getSwitchEvent(): Promise<CharacteristicValue> {
      return this.switchEvent;
    },
    switchOutputState: 0,
    async getSwitchOutputState(): Promise<CharacteristicValue> {
      return this.switchOutputState;
    },
    async setSwitchOutputState(value : CharacteristicValue) {
      this.switchOutputState = value as number;
    },
  };

  constructor(
    private platform: PrinterHomebridgePlatform,
    private accessory: PlatformAccessory,
  ) {

    this.FirwareGCode = getFirmwareByName(accessory.context.device.firmware);

    const path = accessory.context.device.usb_port;

    let baud;
    if (typeof accessory.context.device.baudrate !== 'undefined') {
      baud = accessory.context.device.baudrate;
    } else {
      baud = FDM_Printer.DEFAULT_BAUDRATE;
      platform.log.info(`BaudRate for ${accessory.context.device.displayName} is invalid`);
    }

    this.port = new SerialPort(path, {baudRate: baud, autoOpen: true}, (err) => {
      if (err) {
        return platform.log.info(`USB port ${path}, for ${accessory.context.device.displayName} doesn't exist`);
      }
    });

    //this.port.on('open', () => {
    this.platform.log.info(`${accessory.context.device.displayName} connected...`);
    const parser = new Readline({ delimiter: '\n' });
    this.port.pipe(parser);
    parser.on('data', this.processIncomingData.bind(this));
    this.port.write(this.FirwareGCode.TemperatureAutoReport(1) + '\n');
    //});

    this.port.on('close', () => {
      this.platform.log.info(`${accessory.context.device.displayName} disconnected...`);
    });

    // set accessory information
    //this.platform.log.debug(accessory.context.device);
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.manufacturer)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueId);

    const deviceName = accessory.context.device.displayName;
    const deviceUUID = accessory.context.device.uniqueId;

    // eslint-disable-next-line max-len
    this.hotEnd = this.accessory.getService(deviceName + ' - HotEnd') || this.accessory.addService(this.platform.Service.Thermostat, deviceName + ' - HotEnd', deviceUUID + ' - HotEnd');
    // eslint-disable-next-line max-len
    this.heatedBed = this.accessory.getService(deviceName + ' - HeatedBed') || this.accessory.addService(this.platform.Service.Thermostat, deviceName + ' - HeatedBed', deviceUUID + ' - HeatedBed');
    // eslint-disable-next-line max-len
    this.fan = this.accessory.getService(deviceName + ' - Fan') || this.accessory.addService(this.platform.Service.Fan, deviceName + ' - Fan', deviceUUID + ' - Fan');

    this.setHotEndMaximumTemperature(FDM_Printer.DEFAULT_HOTEND_MAXIMUM_TEMPERATURE);
    this.setHeatedBedMaximumTemperature(FDM_Printer.DEFAULT_HEATED_BED_MAXIMUM_TEMPERATURE);

    // eslint-disable-next-line max-len
    this.heatedBed.getCharacteristic(this.platform.Characteristic.CurrentTemperature).setProps({ minStep: 1, minValue: 0, maxValue: this.HeatedBed.MaximumTemperature });
    // eslint-disable-next-line max-len
    this.heatedBed.getCharacteristic(this.platform.Characteristic.TargetTemperature).setProps({ minStep: 1, minValue: 0, maxValue: this.HeatedBed.MaximumTemperature });

    // register HOTEND characteristics
    this.hotEnd.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getHotEndTemperature.bind(this));

    this.hotEnd.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHotEndHeatingCoolingState.bind(this));

    this.hotEnd.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.getHotEndTargetTemperature.bind(this))
      .onSet(this.setHotendTargetTemperature.bind(this));

    this.hotEnd.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getHotEndTargetHeatingCoolingState.bind(this));

    this.hotEnd.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.getTemperatureDisplayUnits.bind(this))
      .onSet(this.setTemperatureDisplayUnits.bind(this));


    // register HEATED_BED characteristics
    this.heatedBed.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getHeatedBedTemperature.bind(this));

    this.heatedBed.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatedBedHeatingCoolingState.bind(this));

    this.heatedBed.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.getHeatedBedTargetTemperature.bind(this))
      .onSet(this.setHeatedBedTargetTemperature.bind(this));

    this.heatedBed.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getHeatedBedTargetHeatingCoolingState.bind(this));

    this.heatedBed.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.getTemperatureDisplayUnits.bind(this))
      .onSet(this.setTemperatureDisplayUnits.bind(this));


    // register FAN characteristics
    this.fan.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getFanOn.bind(this))
      .onSet(this.setFanOn.bind(this));

    this.fan.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.getFanRotation_Speed.bind(this))
      .onSet(this.setFanRotation_Speed.bind(this));

    // TIME INFORMATION
    setInterval(() => {
      if(!this.port.isOpen) {
        this.platform.log.debug(`Attempting to connect to ${accessory.context.device.displayName}`);
        this.port.open((err) => {
          if (err) {
            this.platform.log.debug('Attempt Failed...');
          }
        });
      }
    }, 1000);
  }

  // DATA TREATMENT
  public async processIncomingData(data: string) {
    this.port.flush();
    this.platform.log.debug(data);
    // eslint-disable-next-line no-control-regex
    const regexp = /([A-Z]): *(-?\d+.?\d*) *[/]*(-?\d+.?\d*)/g;
    let array;
    while ((array = regexp.exec(data)) !== null) {
      if (array[1] === 'T') {
        this.setHotEndTemperature(parseFloat(array[2]));
        this.setHotendTargetTemperature(parseFloat(array[3]));
      } else if (array[1] === 'B') {
        this.setHeatedBedTemperature(parseFloat(array[2]));
        this.setHeatedBedTargetTemperature(parseFloat(array[3]));
      }
    }
  }

  // CLASS ACCESSORS & MUTATORS

  public async setPort(path: string, baudRate: number) {

    this.port = new SerialPort(path, {
      baudRate: baudRate,
    });

    const parser = new Readline({ delimiter: '\n' });
    this.port.pipe(parser);
    parser.on('data', this.processIncomingData.bind(this));
    this.port.write(this.FirwareGCode.TemperatureAutoReport(1) + '\n');
  }

  get getSerialPath() {
    return this.port.path;
  }

  get getBaudRate() {
    return this.port.baudRate;
  }

  // PRINTER
  async setTemperatureDisplayUnits(value: CharacteristicValue) {
    this.temperatureDisplayUnits = value as number;
  }

  async getTemperatureDisplayUnits(): Promise<CharacteristicValue> {
    return this.temperatureDisplayUnits;
  }

  // HOTEND
  async getHotEndTemperature(): Promise<CharacteristicValue> {
    return this.HotEnd.Temperature;
  }

  async getHotEndTargetTemperature(): Promise<CharacteristicValue> {
    return this.HotEnd.TargetTemperature;
  }

  async getCurrentHotEndHeatingCoolingState(): Promise<CharacteristicValue> {
    //TODO : keep previous temperature state to calculate CurrentHeatingCoolingState
    return this.HotEnd.CurrentHeatingCoolingState;
  }

  async getHotEndTargetHeatingCoolingState(): Promise<CharacteristicValue> {
    if (this.HotEnd.Temperature <= this.HotEnd.TargetTemperature - FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    } else if (this.HotEnd.Temperature >= this.HotEnd.TargetTemperature + FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
    } else {
      return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }

  get getHotEndMaximumTemperature() {
    return this.HotEnd.MaximumTemperature;
  }

  // SET
  public setHotEndTemperature = (value: number) => {
    const temperature = value as number;
    let newCurrentHeatingCoolingState;

    if (this.HotEnd.Temperature >= temperature + FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (this.HotEnd.Temperature <= temperature - FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    } else {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    this.HotEnd.CurrentHeatingCoolingState = newCurrentHeatingCoolingState;
    this.HotEnd.Temperature = temperature;
    this.hotEnd.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).updateValue(newCurrentHeatingCoolingState);
    this.hotEnd.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(temperature);
  };

  public async setHotendTargetTemperature(value: CharacteristicValue) {
    const temperature = value as number;

    let newCurrentHeatingCoolingState;

    if (this.HotEnd.Temperature >= temperature + FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (this.HotEnd.Temperature <= temperature - FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    } else {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    this.HotEnd.CurrentHeatingCoolingState = newCurrentHeatingCoolingState;
    this.hotEnd.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).updateValue(newCurrentHeatingCoolingState);

    this.HotEnd.TargetTemperature = temperature;
    this.hotEnd.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(temperature);
    this.port.write(this.FirwareGCode.SetExtruderTemperature(temperature) + '\n');
  }

  public setHotEndMaximumTemperature = (value) => {
    this.HotEnd.MaximumTemperature = value as number;

    // eslint-disable-next-line max-len
    this.hotEnd.getCharacteristic(this.platform.Characteristic.CurrentTemperature).setProps({ minStep: 1, minValue: 0, maxValue: this.HotEnd.MaximumTemperature });
    // eslint-disable-next-line max-len
    this.hotEnd.getCharacteristic(this.platform.Characteristic.TargetTemperature).setProps({ minStep: 1, minValue: 0, maxValue: this.HotEnd.MaximumTemperature });
  };

  // HEATED_BED
  async getHeatedBedTemperature(): Promise<CharacteristicValue> {
    return this.HeatedBed.Temperature;
  }

  async getHeatedBedTargetTemperature(): Promise<CharacteristicValue> {
    return this.HeatedBed.TargetTemperature;
  }

  async getCurrentHeatedBedHeatingCoolingState(): Promise<CharacteristicValue> {
    //TODO : keep previous temperature state to calculate CurrentHeatingCoolingState
    return this.HeatedBed.CurrentHeatingCoolingState;
  }

  async getHeatedBedTargetHeatingCoolingState(): Promise<CharacteristicValue> {
    if (this.HeatedBed.Temperature <= this.HeatedBed.TargetTemperature - FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
    } else if (this.HeatedBed.Temperature >= this.HeatedBed.TargetTemperature + FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
    } else {
      return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }

  get getHeatedBedMaximumTemperature() {
    return this.HeatedBed.MaximumTemperature;
  }

  // SET
  public setHeatedBedTemperature = (value: number) => {
    const temperature = value as number;
    let newCurrentHeatingCoolingState;

    if (this.HeatedBed.Temperature >= temperature + FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (this.HeatedBed.Temperature <= temperature - FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    } else {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    this.HeatedBed.CurrentHeatingCoolingState = newCurrentHeatingCoolingState;
    this.HeatedBed.Temperature = temperature;
    this.heatedBed.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).updateValue(newCurrentHeatingCoolingState);
    this.heatedBed.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(temperature);
  };

  public async setHeatedBedTargetTemperature(value: CharacteristicValue) {
    const temperature = value as number;
    let newCurrentHeatingCoolingState;

    if (this.HeatedBed.Temperature >= temperature + FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
    } else if (this.HeatedBed.Temperature <= temperature - FDM_Printer.HEATING_COLLING_STATE_TOLERANCE) {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
    } else {
      newCurrentHeatingCoolingState = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }

    this.HeatedBed.CurrentHeatingCoolingState = newCurrentHeatingCoolingState;
    this.heatedBed.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).updateValue(newCurrentHeatingCoolingState);

    this.HeatedBed.TargetTemperature = temperature;
    this.heatedBed.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(temperature);
    this.port.write(this.FirwareGCode.SetBedTemperature(temperature) + '\n');
  }

  public setHeatedBedMaximumTemperature = (value) => {
    this.HeatedBed.MaximumTemperature = value as number;

    // eslint-disable-next-line max-len
    this.heatedBed.getCharacteristic(this.platform.Characteristic.CurrentTemperature).setProps({ minStep: 1, minValue: 0, maxValue: this.HeatedBed.MaximumTemperature });
    // eslint-disable-next-line max-len
    this.heatedBed.getCharacteristic(this.platform.Characteristic.TargetTemperature).setProps({ minStep: 1, minValue: 0, maxValue: this.HeatedBed.MaximumTemperature });
  };

  // Fan
  async getFanOn(): Promise<CharacteristicValue> {
    return this.Fan.On;
  }

  async getFanRotation_Speed(): Promise<CharacteristicValue> {
    return this.Fan.Rotation_Speed;
  }

  async setFanOn(value: CharacteristicValue) {
    const state = value as boolean;
    if (!state) {
      this.port.write(this.FirwareGCode.TurnFanOff + '\n');
    } else {
      this.port.write(this.FirwareGCode.SetFanSpeed(Math.round(this.Fan.Rotation_Speed * 2.55)) + '\n');
    }

    this.Fan.On = state;
  }

  async setFanRotation_Speed(value: CharacteristicValue) {
    const rotation_speed = value as number;
    this.port.write(this.FirwareGCode.SetFanSpeed(Math.round(rotation_speed * 2.55)) + '\n');

    this.Fan.Rotation_Speed = rotation_speed;
  }

  //TIME INFORMATION
  async getElapsed(): Promise<CharacteristicValue> {
    return this.PrintInfo.Elapsed_Time;
  }

  async setElapsed(value: CharacteristicValue) {
    this.PrintInfo.Elapsed_Time = value as number;
  }
}

