// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: calendar;

/*

~

This is the Weather Cal code script.
Don't delete it or change its name.

To update, run a Weather Cal widget script.
In the popup, tap "Update code". 
It will update to the newest version.

~

*/

const weatherCal = {

  // Initialize shared object properties.
  initialize(name, iCloudInUse) {
    this.name = name
    this.prefName = "weather-cal-preferences-" + name
    this.iCloudInUse = iCloudInUse
    this.fm = iCloudInUse ? FileManager.iCloud() : FileManager.local()
    this.prefPath = this.fm.joinPath(this.fm.libraryDirectory(), this.prefName)
    this.widgetUrl = "https://raw.githubusercontent.com/mzeryck/Weather-Cal/main/weather-cal.js"
    this.initialized = true
  },

  // Determine what to do when Weather Cal is run.
  async runSetup(name, iCloudInUse, codeFilename, gitHubUrl) {

    // Initialize the shared properties.
    if (!this.initialized) this.initialize(name, iCloudInUse)

    // If no setup file exists, this is the initial Weather Cal setup.
    this.bgPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-" + name)
    const setupPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-setup")
    if (!this.fm.fileExists(setupPath)) { return await this.initialSetup() }

    // If a background file exists for this widget, we're editing settings.
    if (this.fm.fileExists(this.bgPath)) { return await this.editSettings(codeFilename, gitHubUrl) }

    // Otherwise, we're setting up this particular widget.
    await this.generateAlert("Weather Cal is set up, but you need to choose a background for this widget.",["Continue"])
    return await this.setWidgetBackground() 
  },

  // Run the initial setup.
  async initialSetup() {

    // Welcome brand-new users and make sure they like the script name.
    const imported = this.fm.fileExists(this.bgPath)
    if (!imported) {
      let message = "Welcome to Weather Cal. Make sure your script has the name you want before you begin."
      let options = ['I like the name "' + this.name + '"', "Let me go change it"]
      let shouldExit = await this.generateAlert(message,options)
      if (shouldExit) return
    }

    // Welcome the user and check for permissions.
    message = (imported ? "Welcome to Weather Cal. We" : "Next, we") + "need to check if you've given permissions to the Scriptable app. This might take a few seconds."
    options = ["Check permissions"]
    await this.generateAlert(message,options)

    let errors = []
    try { await Location.current() } catch { errors.push("location") }
    try { await CalendarEvent.today() } catch { errors.push("calendar") }
    try { await Reminder.all() } catch { errors.push("reminders") }

    let issues
    if (errors.length > 0) { issues = errors[0] }
    if (errors.length == 2) { issues += " and " + errors[1] }
    if (errors.length == 3) { issues += ", " + errors[1] + ", and " + errors[2] }

    if (issues) { 
      message = "Scriptable does not have permission for " + issues + ". Some features may not work without enabling them in the Settings app."
      options = ["Continue setup anyway", "Exit setup"]
    } else {
      message = "Your permissions are enabled."
      options = ["Continue setup"]
    }
    shouldExit = await this.generateAlert(message,options)
    if (shouldExit) return

    // Set up the weather integration.
    message = "To display the weather on your widget, you need an OpenWeather API key."
    options = ["I already have a key", "I need to get a key", "I don't want to show weather info"]
    const weather = await this.generateAlert(message,options)

    // Show a web view to claim the API key.
    if (weather == 1) {
      message = "On the next screen, sign up for OpenWeather. Find the API key, copy it, and close the web view. You will then be prompted to paste in the key."
      options = ["Continue"]
      let weather = await this.generateAlert(message,options)

      let webView = new WebView()
      webView.loadURL("https://openweathermap.org/home/sign_up")
      await webView.present()
    }

    // We need the API key if we're showing weather.
    if (weather < 2) {
      const response = await this.getWeatherKey(true)
      if (!response) return
    }

    // Set up background image.
    if (!imported) { await this.setWidgetBackground() }

    // Record setup completion.
    this.writePreference("weather-cal-setup", "true")

    message = "Your widget is ready! You'll now see a preview. Re-run this script to edit the default preferences, including localization. When you're ready, add a Scriptable widget to the home screen and select this script."
    options = ["Show preview"]
    await this.generateAlert(message,options)

    // Return and show the preview.
    return this.previewValue()

  },

  // Edit the widget settings.
  async editSettings(codeFilename, gitHubUrl) {
    const menu = { 
      preview: "Show widget preview",
      background: "Change background",
      preferences: "Edit preferences",
      update: "Update code",
      share: "Export widget",
      other: "Other settings",
      exit: "Exit settings menu",
    }
      
    let message = "Widget Setup"
    let options = [menu.preview, menu.background, menu.preferences, menu.update, menu.share, menu.other, menu.exit]
    const response = options[await this.generateAlert(message,options)]

    // Return true to show the widget preview.
    if (response == menu.preview) {
      return this.previewValue()
    } 

    // Set the background and show a preview.
    if (response == menu.background) {
      await this.setWidgetBackground()
      return true
    }

    // Display the preferences panel.
    if (response == menu.preferences) {
      await this.editPreferences()
      return
    }

    // Prompt the user for updates.
    if (response == menu.update) {
      message = "Would you like to update the Weather Cal code? Your widgets will not be affected."
      options = ["Update", "Exit"]
      const updateResponse = await this.generateAlert(message,options)

      // Exit if the user didn't want to update.
      if (updateResponse) return

      // Try updating the code.
      const success = await this.downloadCode(codeFilename, gitHubUrl)
      message = success ? "The update is now complete." : "The update failed. Please try again later."
      options = ["OK"]

      await this.generateAlert(message,options)
      return
    }
    
    if (response == menu.share) {
      const code = this.fm.readString(this.fm.joinPath(this.fm.documentsDirectory(), this.name + ".js"))
      const layout = code.split('`')[1]
      const prefs = JSON.stringify(this.getSettings())
      const bg = this.fm.readString(this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-" + this.name))

      const widgetExport = `async function importWidget() {

      function makeAlert(message,options) {
        const a = new Alert()
        a.message = message
        for (const option of options) { a.addAction(option) }
        return a
      }

      let fm = FileManager.local()
      fm = fm.isFileStoredIniCloud(module.filename) ? FileManager.iCloud() : fm

      const path = fm.joinPath(fm.documentsDirectory(), "Weather Cal code.js")
      const wc = fm.fileExists(path) ? fm.readString(path) : false
      const version = wc ? parseInt(wc.slice(wc.lastIndexOf("//") + 2).trim()) : false

      if (wc && (!version || version < 4)) { return await makeAlert("Please update Weather Cal before importing a widget.",["OK"]).present() }

      if ((await makeAlert("Do you want your widget to be named " + Script.name() + "?",["Yes, looks good","No, let me change it"]).present()) == 1) { return }

      fm.writeString(fm.joinPath(fm.libraryDirectory(), "weather-cal-preferences-" + Script.name()), '${prefs}')
      fm.writeString(fm.joinPath(fm.libraryDirectory(), "weather-cal-" + Script.name()), '${bg}')

      let code = await new Request('${this.widgetUrl}').loadString()
      let arr = code.split('\`')
      arr[1] = \`${layout}\`

      alert = makeAlert("Close this script and re-run it to finish setup.",["OK"])
      fm.writeString(module.filename, arr.join('\`'))
      await alert.present()
      }
      await importWidget()
      Script.complete()`
      
      message = "Your export is ready."
      options = ["Save to Files", "Display as text to copy"]
      const shouldUseQuickLook = await this.generateAlert(message,options)
      
      if (shouldUseQuickLook) {
        const comment = '/*\n\n\n\nTap the Share icon in the top right.\nThen tap "Copy" to copy all of this code.\nNow you can paste into a new script.\n\n\n\n*/\n'
        QuickLook.present(comment + widgetExport)
      } else {
        DocumentPicker.exportString(widgetExport, this.name + " export.js")
      }
    }
    
    if (response == menu.other) {
      message = "Other settings"
      options = ["Re-enter API key", "Completely reset widget", "Exit"]
      const otherResponse = await this.generateAlert(message,options)
    
      // Set the API key.
      if (otherResponse == 0) {
        await this.getWeatherKey()
        return
      }

      // Reset the widget.
      if (otherResponse == 1) {
        const alert = new Alert()
        alert.message = "Are you sure you want to completely reset this widget?"
        alert.addDestructiveAction("Reset")
        alert.addAction("Cancel")

        const cancelReset = await alert.present()
        if (cancelReset == 0) {
          const bgPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-" + this.name)
          if (this.fm.fileExists(bgPath)) { this.fm.remove(bgPath) }
          if (this.fm.fileExists(this.prefPath)) { this.fm.remove(this.prefPath) }
          const success = await this.downloadCode(this.name, this.widgetUrl)
          message = success ? "This script has been reset. Close the script and reopen it for the change to take effect." : "The reset failed."
          options = ["OK"]
          await this.generateAlert(message,options)
        }
        return
      }
    }

    // If response was Exit, just return.
    return
  },

  // Get the weather key, optionally determining if it's the first run.
  async getWeatherKey(firstRun = false) {

    // Prompt for the key.
    const returnVal = await this.promptForText("Paste your API key in the box below.",[""],["82c29fdbgd6aebbb595d402f8a65fabf"])
    const apiKey = returnVal.textFieldValue(0)

    let message, options
    if (!apiKey || apiKey == "" || apiKey == null) {
      message = "No API key was entered. Try copying the key again and re-running this script."
      options = ["Exit"]
      await this.generateAlert(message,options)
      return false
    }

    // Save the key.
    this.writePreference("weather-cal-api-key", apiKey)

    // Test to see if the key works.
    const req = new Request("https://api.openweathermap.org/data/2.5/onecall?lat=37.332280&lon=-122.010980&appid=" + apiKey)

    let val = {}
    try { val = await req.loadJSON() } catch { val.current = false }

    // Warn the user if it didn't work.
    if (!val.current) {
      message = firstRun ? "New OpenWeather API keys may take a few hours to activate. Your widget will start displaying weather information once it's active." : "The key you entered, " + apiKey + ", didn't work. If it's a new key, it may take a few hours to activate."
      options = [firstRun ? "Continue" : "OK"]
      await this.generateAlert(message,options)

    // Otherwise, confirm that it was saved.
    } else if (val.current && !firstRun) {
      message = "The new key worked and was saved."
      options = ["OK"]
      await this.generateAlert(message,options)
    }

    // If we made it this far, we did it.
    return true
  },

  // Set the background of the widget.
  async setWidgetBackground() {

    // Prompt for the widget background.
    let message = "What type of background would you like for your widget?"
    let options = ["Solid color", "Automatic gradient", "Custom gradient", "Image from Photos"]
    let backgroundType = await this.generateAlert(message,options)

    let background = {}
    let returnVal
    if (backgroundType == 0) {
      background.type = "color"
      returnVal = await this.promptForText("Enter the hex value of the background color you want.",[""],["#007030"])
      background.color = returnVal.textFieldValue(0)

    } else if (backgroundType == 1) {
      background.type = "auto"

    } else if (backgroundType == 2) {
      background.type = "gradient"
      returnVal = await this.promptForText("Enter the hex value of the first gradient color.",[""],["#007030"])
      background.initialColor = returnVal.textFieldValue(0)
      returnVal = await this.promptForText("Enter the hex value of the second gradient color.",[""],["#007030"])
      background.finalColor = returnVal.textFieldValue(0)

    } else if (backgroundType == 3) {
      background.type = "image"

      // Create the Weather Cal directory if it doesn't already exist.
      const dirPath = this.fm.joinPath(this.fm.documentsDirectory(), "Weather Cal")
      if (!this.fm.fileExists(dirPath) || !this.fm.isDirectory(dirPath)) {
        this.fm.createDirectory(dirPath)
      }

      // Determine if a dupe already exists.
      const dupePath = this.fm.joinPath(dirPath, this.name + " 2.jpg")
      const dupeAlreadyExists = this.fm.fileExists(dupePath)

      // Get the image and write it to disk.
      const img = await Photos.fromLibrary()
      const path = this.fm.joinPath(dirPath, this.name + ".jpg")
      this.fm.writeImage(path, img)

      // If we just created a dupe, alert the user.
      if (!dupeAlreadyExists && this.fm.fileExists(dupePath)) {
        message = "Weather Cal detected a duplicate image. Please open the Files app, navigate to Scriptable > Weather Cal, and make sure the file named " + this.name + ".jpg is correct."
        options = ["OK"]
        const response = this.generateAlert(message,options)
      }
    }

    this.writePreference("weather-cal-" + this.name, background)
    return this.previewValue() 
  },

  // Load or reload a table full of preferences.
  async loadTable(table,category,settingsObject) {
    table.removeAllRows()
    for (key in category) {
      // Don't show the name as a setting.
      if (key == "name") continue

      // Make the row.
      const row = new UITableRow()
      row.dismissOnSelect = false
      row.height = 55

      // Fill it with the setting information.
      const setting = category[key]

      let valText
      if (typeof setting.val == "object") {
        for (subItem in setting.val) {
          const setupText = subItem + ": " + setting.val[subItem]
          if (!valText) {
            valText = setupText
            continue
          }
          valText += ", " + setupText
        }
      } else {
        valText = setting.val + ""
      }

      const cell = row.addText(setting.name,valText)
      cell.subtitleColor = Color.gray()

      // If there's no type, it's just text.
      if (!setting.type) {
        row.onSelect = async () => {
          const returnVal = await this.promptForText(setting.name,[setting.val],[],setting.description)
          setting.val = returnVal.textFieldValue(0)
          this.loadTable(table,category,settingsObject)
        }

      } else if (setting.type == "enum") {
        row.onSelect = async () => {
          const returnVal = await this.generateAlert(setting.name,setting.options,setting.description)
          setting.val = setting.options[returnVal]
          await this.loadTable(table,category,settingsObject)
        }

      } else if (setting.type == "bool") {
        row.onSelect = async () => {
          const returnVal = await this.generateAlert(setting.name,["true","false"],setting.description)
          setting.val = !returnVal
          await this.loadTable(table,category,settingsObject)
        }

      } else if (setting.type == "multival") {
        row.onSelect = async () => {

          // We need an ordered set.
          let keys = []
          let values = []
          for (const item in setting.val) {
            keys.push(item)
            values.push(setting.val[item])
          }

          const returnVal = await this.promptForText(setting.name,values,keys,setting.description)

          for (let i=0; i < keys.length; i++) {
            const currentKey = keys[i]
            setting.val[currentKey] = returnVal.textFieldValue(i)
          }

          await this.loadTable(table,category,settingsObject)
        }
      }
      // Add it to the table.
      table.addRow(row)
    }

    table.reload()
  },
  
  getSettings(forEditing = false) {
    
    // Try to get the settings from file.
    let settingsFromFile  
    if (this.fm.fileExists(this.prefPath)) {
      settingsFromFile = JSON.parse(this.fm.readString(this.prefPath))
    }
    
    // Start with the default settings.
    let settingsObject = this.defaultSettings()
    
    // Iterate through the settings object.
    for (category in settingsObject) {
      for (item in settingsObject[category]) {

        // If the setting exists, use it. Otherwise, the default is used.
        let value = (settingsFromFile && settingsFromFile[category]) ? settingsFromFile[category][item] : undefined
        if (value == undefined) { value = settingsObject[category][item].val }
        
        // Format the object correctly depending on where it will be used.
        if (forEditing) { settingsObject[category][item].val = value }
        else { settingsObject[category][item] = value }
        
      }
    }
    return settingsObject
  },

  // Edit preferences of the widget.
  async editPreferences() {

    // Get the preferences object.
    const settingsObject = this.getSettings(true)
    if (!settingsObject) {
      await this.generateAlert("No preferences file exists. If you're on an older version of Weather Cal, you need to reset your widget in order to use the preferences editor.",["OK"])
      return
    }

    // Create the settings table.
    const table = new UITable()
    table.showSeparators = true

    // Iterate through each item in the settings object.
    for (key in settingsObject) {

      // Make the row.
      let row = new UITableRow()
      row.dismissOnSelect = false

      // Fill it with the category information.
      const category = settingsObject[key]
      row.addText(category.name)
      row.onSelect = async () => {
        const subTable = new UITable()
        subTable.showSeparators = true
        await this.loadTable(subTable,category,settingsObject)
        await subTable.present()
      }

      // Add it to the table.
      table.addRow(row)
    }
    await table.present()

    // Upon dismissal, roll up preferences and write to disk.
    for (category in settingsObject) {
      for (item in settingsObject[category]) {
        if (item == "name") continue
        settingsObject[category][item] = settingsObject[category][item].val
      }
    }
    this.writePreference(this.prefName, settingsObject)
  },

  // Return the widget preview value.
  previewValue() {
    if (this.fm.fileExists(this.prefPath)) {
      let settingsObject = JSON.parse(this.fm.readString(this.prefPath))
      return settingsObject.widget.preview || settingsObject.widget.preview.val
    } else {
      return "large"
    }
  },

  // Download a Scriptable script.
  async downloadCode(filename, url) {
    const pathToCode = this.fm.joinPath(this.fm.documentsDirectory(), filename + ".js")
    const req = new Request(url)

    try {
      const codeString = await req.loadString()
      if (codeString.indexOf("// Variables used by Scriptable.") < 0) {
        return false
      } else {
        this.fm.writeString(pathToCode, codeString)
        return true
      }
    } catch {
      return false
    }
  },

  // Generate an alert with the provided array of options.
  async generateAlert(title,options,message = null) {

    const alert = new Alert()
    alert.title = title
    if (message) alert.message = message

    for (const option of options) {
      alert.addAction(option)
    }

    const response = await alert.presentAlert()
    return response
  },

  // Prompt for one or more text field values.
  async promptForText(title,values,keys,message = null) {
    const alert = new Alert()
    alert.title = title
    if (message) alert.message = message

    for (let i=0; i < values.length; i++) {
      alert.addTextField(keys ? (keys[i] || null) : null,values[i] + "")
    }

    alert.addAction("OK")
    await alert.present()
    return alert
  },

  // Write the value of a preference to disk.
  writePreference(filename, value) {
    const path = this.fm.joinPath(this.fm.libraryDirectory(), filename)

    if (typeof value === "string") {
      this.fm.writeString(path, value)
    } else {
      this.fm.writeString(path, JSON.stringify(value))
    }
  },

  // Create and return the widget.
  async createWidget(layout, name, iCloudInUse, custom) {

    // Initialize if we haven't already.
    if (!this.initialized) this.initialize(name, iCloudInUse)

    // Determine if we're using the old or new setup.
    if (typeof layout == "object") {
      this.settings = layout

    } else {
      this.settings = this.getSettings()
      this.settings.layout = layout
    }

    // Initialize additional shared properties.
    this.locale = this.settings.widget.locale
    this.padding = parseInt(this.settings.widget.padding)
    this.tintIcons = this.settings.widget.tintIcons
    this.localization = this.settings.localization
    this.format = this.settings.font
    this.data = {}
    this.now = new Date()
    this.custom = custom

    // Make sure we have a locale value.
    if (!this.locale || this.locale == "" || this.locale == null) { this.locale = Device.locale() }

    // Set up the widget.
    this.widget = new ListWidget()
    this.widget.spacing = 0
    
    // Determine the default padding values.
    const verticalPad = this.padding < 10 ? 10 - this.padding : 10
    const horizontalPad = this.padding < 15 ? 15 - this.padding : 15
    
    // If we have custom widget padding, use it.
    const widgetPad = this.settings.widget.widgetPadding || {}
    const topPad    = (widgetPad.top && widgetPad.top.length) ? parseInt(widgetPad.top)    : verticalPad
    const leftPad   = (widgetPad.left && widgetPad.left.length) ? parseInt(widgetPad.left)   : horizontalPad
    const bottomPad = (widgetPad.bottom && widgetPad.bottom.length) ? parseInt(widgetPad.bottom) : verticalPad
    const rightPad  = (widgetPad.right && widgetPad.right.length) ? parseInt(widgetPad.right)  : horizontalPad
    
    this.widget.setPadding(topPad, leftPad, bottomPad, rightPad)

    /*
     * BACKGROUND DISPLAY
     * ==================
     */

    // Read the background information from disk.
    const backgroundPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-" + name)
    const backgroundRaw = this.fm.readString(backgroundPath)
    const background = JSON.parse(backgroundRaw)

    if (custom && custom.background) {
      await custom.background(this.widget)

    } else if (background.type == "color") {
      this.widget.backgroundColor = new Color(background.color)

    } else if (background.type == "auto") {
      const gradient = new LinearGradient()
      const gradientSettings = await this.setupGradient()

      gradient.colors = gradientSettings.color()
      gradient.locations = gradientSettings.position()

      this.widget.backgroundGradient = gradient

    } else if (background.type == "gradient") {
      const gradient = new LinearGradient()
      const initialColor = new Color(background.initialColor)
      const finalColor = new Color(background.finalColor)

      gradient.colors = [initialColor, finalColor]
      gradient.locations = [0, 1]

      this.widget.backgroundGradient = gradient

    } else if (background.type == "image") {

      // Determine if our image exists.
      const dirPath = this.fm.joinPath(this.fm.documentsDirectory(), "Weather Cal")
      const path = this.fm.joinPath(dirPath, name + ".jpg")
      const exists = this.fm.fileExists(path)

      // If it exists, load from file.
      if (exists) {
        if (this.iCloudInUse) { await this.fm.downloadFileFromiCloud(path) }
        this.widget.backgroundImage = this.fm.readImage(path)

      // If it's missing when running in the widget, use a gray background.
      } else if (!exists && config.runsInWidget) {
        this.widget.backgroundColor = Color.gray() 

      // But if we're running in app, prompt the user for the image.
      } else {
        const img = await Photos.fromLibrary()
        this.widget.backgroundImage = img
        this.fm.writeImage(path, img)
      }
    }

    /*
     * CONSTRUCTION
     * ============
     */

    // Set up the layout variables.
    this.currentRow = {}
    this.currentColumn = {}

    // Set up the initial alignment.
    this.left()

    // Set up the global ASCII variables.
    this.foundASCII = null
    this.usingASCII = null
    this.currentColumns = []
    this.rowNeedsSetup = false

    // Process the layout.
    for (line of this.settings.layout.split(/\r?\n/)) {
      await this.processLine(line)
    }

    // Finish the widget and return.
    return this.widget
  },

  // Execute a function for the layout generator.
  async executeFunction(functionName,parameter = null) {

    // If a custom function exists, use it.
    if (this.custom && this.custom[functionName]) {
      this.currentFunc = this.custom[functionName]

    // Otherwise, use the built-in function.
    } else if (this[functionName]) {
      this.currentFunc = this[functionName]

    // If we can't find it, we failed.
    } else { return false }

    // If we were given a parameter, use it.
    if (parameter) {
      await this.currentFunc(this.currentColumn, parameter)

    // Otherwise, just pass the column.
    } else {
      await this.currentFunc(this.currentColumn)
    }
    return true

  },

  // Process a single line of input.
  async processLine(lineInput,wc) {

    // Trim the input.
    const line = lineInput.trim()

    // If it's blank, return.
    if (line == '') { return }

    // If we have a row, we're not using ASCII.
    if (!this.foundASCII && line.includes('row')) { 
      this.foundASCII = true
      this.usingASCII = false 

    // If we have a row of dashes, we're using ASCII.
    } else if (!this.foundASCII && line[0] == '-' && line[line.length-1] == '-') {
      this.foundASCII = true
      this.usingASCII = true 
    }

    if (this.usingASCII) { await this.processASCIILine(line) }
    else { await this.processRegularLine(line) }
  },

  // Process a single line of regular layout.
  async processRegularLine(lineInput) {

    let line = lineInput

    // If it's using the old style, remove the comma.
    if (line[line.length-1] == ',') {
      line = line.slice(0, -1)
    }

    // If there are no parentheses, run the function.
    let item = line.split('(')
    if (!item[1]) {
      await this.executeFunction(item[0])
      return
    }

    // Otherwise, pass the parameter.
    const param = item[1].slice(0, -1)
    await this.executeFunction(item[0],parseInt(param) || param)
  },

  // Processes a single line of ASCII. 
  async processASCIILine(lineInput) {

    const line = lineInput.replace(/\.+/g,'')

    // If it's a line, enumerate previous columns (if any) and set up the new row.
    if (line[0] == '-' && line[line.length-1] == '-') { 
      if (this.currentColumns.length > 0) { 
        for (col of this.currentColumns) {

          // If it's null, go to the next one.
          if (!col) { continue }

          // If there's a width, use the width function.
          if (col.width) {
            this.column(this.currentColumn,col.width)

          // Otherwise, create the column normally.
          } else {
            this.column(this.currentColumn)
          }
          for (item of col.items) {
            await this.executeFunction(item)
          }
        }
        this.currentColumns = []
      }
      this.rowNeedsSetup = true
      return
    }

    // If it's the first content row, finish the row setup.
    if (this.rowNeedsSetup) { 
      this.row(this.currentColumn)
      this.rowNeedsSetup = false 
    }

    // If there's a number, this is a setup row.
    const setupRow = line.match(/\d+/)

    // Otherwise, it has columns.
    const items = line.split('|')

    // Iterate through each item.
    for (var i=1; i < items.length-1; i++) {

      // If the current column doesn't exist, make it.
      if (!this.currentColumns[i]) { this.currentColumns[i] = { items: [] } }

      // Now we have a column to add the items to.
      const column = this.currentColumns[i].items

      // Get the current item and its trimmed version.
      const item = items[i]
      const trim = item.trim()

      // If it's not a function, figure out spacing.
      const functionExists = this[trim] || (this.custom && this.custom[trim])
      if (!functionExists) { 

        // If it's a setup row, whether or not we find the number, we keep going.
        if (setupRow) {
          const value = parseInt(trim, 10)
          if (value) { this.currentColumns[i].width = value }
          continue
        }

        // If it's blank and we haven't already added a space, add one.
        const prevItem = column[column.length-1]
        if (trim == '' && (!prevItem || (prevItem && !prevItem.startsWith("space")))) {
          column.push("space")
        }

        // Either way, we're done.
        continue

      }

      // Determine the alignment.
      const index = item.indexOf(trim)
      const length = item.slice(index,item.length).length

      let alignment
      if (index > 0 && length > trim.length) { alignment = "center" }
      else if (index > 0) { alignment = "right" }
      else { alignment = "left" }

      // Add the items to the column.
      column.push(alignment)
      column.push(trim)
    }
  },

  // Makes a new row on the widget.
  row(input, parameter) {

    this.currentRow = this.widget.addStack()
    this.currentRow.layoutHorizontally()
    this.currentRow.setPadding(0, 0, 0, 0)
    this.currentColumn.spacing = 0

    if (parameter) {
      this.currentRow.size = new Size(0,parameter)
    }
  },

  // Makes a new column on the widget.
  column(input, parameter) {

    this.currentColumn = this.currentRow.addStack()
    this.currentColumn.layoutVertically()
    this.currentColumn.setPadding(0, 0, 0, 0)
    this.currentColumn.spacing = 0

    if (parameter) {
      this.currentColumn.size = new Size(parameter,0)
    }
  },

  // This function adds a space, with an optional amount.
  space(input, parameter) { 

    if (parameter) { input.addSpacer(parameter) }
    else { input.addSpacer() }

  },

  /*
   * ALIGNMENT FUNCTIONS
   * These functions manage the alignment.
   * =============================================
   */

  // Create an aligned stack to add content to.
  align(column) {

    // Add the containing stack to the column.
    let alignmentStack = column.addStack()
    alignmentStack.layoutHorizontally()

    // Get the correct stack from the alignment function.
    let returnStack = this.currentAlignment(alignmentStack)
    returnStack.layoutVertically()
    return returnStack
  },

  // Change the current alignment to right.
  right() { 
    function alignRight(alignmentStack) {
      alignmentStack.addSpacer()
      let returnStack = alignmentStack.addStack()
      return returnStack
    }
    this.currentAlignment = alignRight 
  },

  // Change the current alignment to left.
  left() { 
    function alignLeft(alignmentStack) {
      let returnStack = alignmentStack.addStack()
      alignmentStack.addSpacer()
      return returnStack
    }
    this.currentAlignment = alignLeft 
  },

  // Change the current alignment to center.
  center() { 
    function alignCenter(alignmentStack) {
      alignmentStack.addSpacer()
      let returnStack = alignmentStack.addStack()
      alignmentStack.addSpacer()
      return returnStack
    }
    this.currentAlignment = alignCenter 
  },

  /*
   * SETUP FUNCTIONS
   * These functions prepare data needed for items.
   * ==============================================
   */

  // Set up the event data object.
  async setupEvents() {

    this.data.events = {}
    const eventSettings = this.settings.events

    // Determine if calendars are being filtered.
    let calSetting = eventSettings.selectCalendars
    let calendars = []
    if (Array.isArray(calSetting)) {
      calendars = calSetting
    } else if (typeof calSetting == "string") {
      calSetting = calSetting.trim()
      calendars = calSetting.length > 0 ? calSetting.split(",") : []
    }

    // Get the necessary settings.
    const numberOfEvents = parseInt(eventSettings.numberOfEvents)
    const minutesAfter = parseInt(eventSettings.minutesAfter) * 60000 || 0
    
    // Determine number of days to show. If no setting exists, use 1.
    let numberOfDays = parseInt(eventSettings.numberOfDays)
    numberOfDays = isNaN(numberOfDays) ? 1 : numberOfDays
    
    // Complex due to support for old boolean values.
    let showFutureAt = parseInt(eventSettings.showTomorrow)
    showFutureAt = isNaN(showFutureAt) ? (eventSettings.showTomorrow ? 0 : 24) : showFutureAt
    
    // Get the right scope.
    const current = this.now
    const dateDiff = this.dateDiff

    // Function to determine if an event should be shown.
    function shouldShowEvent(event) {
    
      const diff = dateDiff(current, event.startDate)
      
      // If it's in the past or too far in the future, don't show it.
      if (diff < 0 || diff > numberOfDays) { return false }
      
      // Don't show if it's in the future before the right time of day.
      if (diff > 0 && current.getHours() < showFutureAt) { return false }

      // If events are filtered and the calendar isn't in the selected calendars, return false.
      if (calendars.length && !calendars.includes(event.calendar.title)) { return false }

      // Hack to remove canceled Office 365 events.
      if (event.title.startsWith("Canceled:")) { return false }

      // If it's an all-day event, only show if the setting is active.
      if (event.isAllDay) { return eventSettings.showAllDay }

      // Otherwise, return the event if it's in the future or recently started.
      const minutesAfter = parseInt(eventSettings.minutesAfter) * 60000 || 0
      return (event.startDate.getTime() + minutesAfter > current.getTime())
    }

    // Get all relevant events.
    let events = await CalendarEvent.thisWeek([])
    const nextWeek = await CalendarEvent.nextWeek([])
    events.push(...nextWeek)
    
    // Set the number of events shown.
    events = events.filter(shouldShowEvent).slice(0,numberOfEvents)

    // Store the future events.
    this.data.events.futureEvents = events
  },

  // Set up the reminders data object.
  async setupReminders() {

    this.data.reminders = {}
    const reminderSettings = this.settings.reminders 

    let listSetting = reminderSettings.selectLists
    let lists = []
    if (Array.isArray(listSetting)) {
      lists = listSetting
    } else if (typeof listSetting == "string") {
      listSetting = listSetting.trim()
      lists = listSetting.length > 0 ? listSetting.split(",") : []
    }

    const numberOfReminders = parseInt(reminderSettings.numberOfReminders)
    const showWithoutDueDate = reminderSettings.showWithoutDueDate
    const showOverdue = reminderSettings.showOverdue
    
    const sameDay = this.sameDay
    const currentDate = this.now

    // Function to determine if an event should be shown.
    function shouldShowReminder(reminder) {

      // If reminders are filtered and the list isn't in the selected lists, return false.
      if (lists.length && !lists.includes(reminder.calendar.title)) { return false }

      // If there's no due date, use the setting.
      if (!reminder.dueDate)  { return showWithoutDueDate }

      // If it's overdue, use the setting.
      if (reminder.isOverdue) { return showOverdue }

      // If we only want today and overdue, use the setting.
      if (reminderSettings.todayOnly) { 
        return sameDay(reminder.dueDate, currentDate)
      }

      // Otherwise, return true.
      return true
    }

    // Determine which reminders to show.
    let reminders = await Reminder.allIncomplete()

    // Sort in order of due date.
    reminders.sort(function(a, b) {

      // Due dates are always picked first.
      if (!a.dueDate && b.dueDate) return 1
      if (a.dueDate && !b.dueDate) return -1
      if (!a.dueDate && !b.dueDate) return 0

      // Otherwise, earlier due dates go first.
      const aTime = a.dueDate.getTime()
      const bTime = b.dueDate.getTime()

      if (aTime > bTime) return 1
      if (aTime < bTime) return -1
      return 0 
    })

    // Set the number of reminders shown.
    reminders = reminders.filter(shouldShowReminder).slice(0,numberOfReminders)

    // Store the data.
    this.data.reminders.all = reminders
  },

  // Set up the gradient for the widget background.
  async setupGradient() {

    // Requirements: sunrise
    if (!this.data.sun) { await this.setupSunrise() }

    let gradient = {
      dawn: {
        color() { return [new Color("142C52"), new Color("1B416F"), new Color("62668B")] },
        position() { return [0, 0.5, 1] },
      },

      sunrise: {
        color() { return [new Color("274875"), new Color("766f8d"), new Color("f0b35e")] },
        position() { return [0, 0.8, 1.5] },
      },

      midday: {
        color() { return [new Color("3a8cc1"), new Color("90c0df")] },
        position() { return [0, 1] },
      },

      noon: {
        color() { return [new Color("b2d0e1"), new Color("80B5DB"), new Color("3a8cc1")] },
        position() { return [-0.2, 0.2, 1.5] },
      },

      sunset: {
        color() { return [new Color("32327A"), new Color("662E55"), new Color("7C2F43")] },
        position() { return [0.1, 0.9, 1.2] },
      },

      twilight: {
        color() { return [new Color("021033"), new Color("16296b"), new Color("414791")] },
        position() { return [0, 0.5, 1] },
      },

      night: {
        color() { return [new Color("16296b"), new Color("021033"), new Color("021033"), new Color("113245")] },
        position() { return [-0.5, 0.2, 0.5, 1] },
      },
    }

    const sunrise = this.data.sun.sunrise
    const sunset = this.data.sun.sunset

    // Use sunrise or sunset if we're within 30min of it.
    if (this.closeTo(sunrise)<=15) { return gradient.sunrise }
    if (this.closeTo(sunset)<=15) { return gradient.sunset }

    // In the 30min before/after, use dawn/twilight.
    if (this.closeTo(sunrise)<=45 && this.now.getTime() < sunrise) { return gradient.dawn }
    if (this.closeTo(sunset)<=45 && this.now.getTime() > sunset) { return gradient.twilight }

    // Otherwise, if it's night, return night.
    if (this.isNight(this.now)) { return gradient.night }

    // If it's around noon, the sun is high in the sky.
    if (this.now.getHours() == 12) { return gradient.noon }

    // Otherwise, return the "typical" theme.
    return gradient.midday
  },

  // Set up the location data object.
  async setupLocation() {

    // Get the cached location info if it exists.
    const locationPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-location")
    const locationExists = this.fm.fileExists(locationPath)
    let cachedLocation
    if (locationExists) {
      cachedLocation = JSON.parse(this.fm.readString(locationPath))
    }

    // If it's been more than an hour, ask iOS for location.
    let location, geocode
    const timeToCache = 60 * 60 * 1000
    const locationDate = locationExists ? this.fm.modificationDate(locationPath).getTime() : -(timeToCache+1)
    const locationDataOld = (this.now.getTime() - locationDate) > timeToCache
    if (locationDataOld) {
      try {
        location = await Location.current()
        geocode = location ? await Location.reverseGeocode(location.latitude, location.longitude, this.locale) : false
      } catch {}
    }

    // Store the possible location values in the data object.
    this.data.location = {}

    if (location) {
      this.data.location.latitude = location.latitude
      this.data.location.longitude = location.longitude
    } else {
      this.data.location.latitude = cachedLocation.latitude
      this.data.location.longitude = cachedLocation.longitude
    }

    if (geocode) {
      this.data.location.locality = (geocode[0].locality || geocode[0].postalAddress.city) || geocode[0].administrativeArea
    } else {
      this.data.location.locality = cachedLocation.locality
    }

    // If we have old location data, save it to disk.
    if (locationDataOld) {
      this.fm.writeString(locationPath, JSON.stringify(this.data.location))
    }
  },

  // Set up the sun data object.
  async setupSunrise() {

    // Requirements: location
    if (!this.data.location) { await this.setupLocation() }

    let data = this.data
    async function getSunData(date) {
      const req = "https://api.sunrise-sunset.org/json?lat=" + data.location.latitude + "&lng=" + data.location.longitude + "&formatted=0&date=" + date.getFullYear() + "-" + (date.getMonth()+1) + "-" + date.getDate()
      const sunData = await new Request(req).loadJSON()
      return sunData
    }

    // Set up the sunrise/sunset cache.
    const sunCachePath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-sunrise")
    const sunCacheExists = this.fm.fileExists(sunCachePath)
    const sunCacheDate = sunCacheExists ? this.fm.modificationDate(sunCachePath) : 0
    let sunDataRaw

    // If cache exists and was created today, use cached data.
    if (sunCacheExists && this.sameDay(this.now, sunCacheDate)) {
      const sunCache = this.fm.readString(sunCachePath)
      sunDataRaw = JSON.parse(sunCache)
    }

    // Otherwise, get the data from the server.
    else {

      sunDataRaw = await getSunData(this.now)

      // Calculate tomorrow's date and get tomorrow's data.
      let tomorrowDate = new Date()
      tomorrowDate.setDate(this.now.getDate() + 1)
      const tomorrowData = await getSunData(tomorrowDate)
      sunDataRaw.results.tomorrow = tomorrowData.results.sunrise

      // Cache the file.
      this.fm.writeString(sunCachePath, JSON.stringify(sunDataRaw))
    }

    // Store the timing values.
    this.data.sun = {}
    this.data.sun.sunrise = new Date(sunDataRaw.results.sunrise).getTime()
    this.data.sun.sunset = new Date(sunDataRaw.results.sunset).getTime()
    this.data.sun.tomorrow = new Date(sunDataRaw.results.tomorrow).getTime()
  },

  // Set up the weather data object.
  async setupWeather() {

    // Get the weather settings.
    const weatherSettings = this.settings.weather

    // Requirements: location
    if (!this.data.location) { await this.setupLocation() }

    // Set up the cache.
    const cachePath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-cache")
    const cacheExists = this.fm.fileExists(cachePath)
    const cacheDate = cacheExists ? this.fm.modificationDate(cachePath) : 0
    let weatherDataRaw

    // If cache exists and it's been less than 60 seconds since last request, use cached data.
    if (cacheExists && (this.now.getTime() - cacheDate.getTime()) < 60000) {
      const cache = this.fm.readString(cachePath)
      weatherDataRaw = JSON.parse(cache)

    // Otherwise, use the API to get new weather data.
    } else {

      // OpenWeather only supports a subset of language codes.
      const openWeatherLang = ["af","al","ar","az","bg","ca","cz","da","de","el","en","eu","fa","fi","fr","gl","he","hi","hr","hu","id","it","ja","kr","la","lt","mk","no","nl","pl","pt","pt_br","ro","ru","sv","se","sk","sl","sp","es","sr","th","tr","ua","uk","vi","zh_cn","zh_tw","zu"]
      var lang

      // Find all possible language matches.
      const languages = [this.locale, this.locale.split("_")[0], Device.locale(), Device.locale().split("_")[0]]

      for (item of languages) {
        // If it matches, use the value and stop the loop.
        if (openWeatherLang.includes(item)) {
          lang = "&lang=" + item
          break
        }
      }

      const apiKeyPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-api-key")
      const apiKey = this.fm.readString(apiKeyPath)

      try {
        const weatherReq = "https://api.openweathermap.org/data/2.5/onecall?lat=" + this.data.location.latitude + "&lon=" + this.data.location.longitude + "&exclude=minutely,alerts&units=" + this.settings.widget.units + lang + "&appid=" + apiKey
        weatherDataRaw = await new Request(weatherReq).loadJSON()
        this.fm.writeString(cachePath, JSON.stringify(weatherDataRaw))
      } catch {}
    }

    // If it's an error, treat it as a null value.
    if (weatherDataRaw.cod) { weatherDataRaw = null }

    // English continues using the "main" weather description.
    const english = (this.locale.split("_")[0] == "en")

    // Store the weather values.
    this.data.weather = {}
    this.data.weather.currentTemp = weatherDataRaw ? weatherDataRaw.current.temp : null
    this.data.weather.currentCondition = weatherDataRaw ? weatherDataRaw.current.weather[0].id : 100
    this.data.weather.currentDescription = weatherDataRaw ? (english ? weatherDataRaw.current.weather[0].main : weatherDataRaw.current.weather[0].description) : "--"
    this.data.weather.todayHigh = weatherDataRaw ? weatherDataRaw.daily[0].temp.max : null
    this.data.weather.todayLow = weatherDataRaw ? weatherDataRaw.daily[0].temp.min : null
    this.data.weather.forecast = []
    this.data.weather.hourly = []

    for (let i=0; i <= 7; i++) {
      this.data.weather.forecast[i] = weatherDataRaw ? ({High: weatherDataRaw.daily[i].temp.max, Low: weatherDataRaw.daily[i].temp.min, Condition: weatherDataRaw.daily[i].weather[0].id}) : { High: null, Low: null, Condition: 100 }
      this.data.weather.hourly[i] = weatherDataRaw ? ({Temp: weatherDataRaw.hourly[i].temp, Condition: weatherDataRaw.hourly[i].weather[0].id}) : { Temp: null, Condition: 100 }
    }
    this.data.weather.tomorrowRain = weatherDataRaw ? weatherDataRaw.daily[1].pop : null
    this.data.weather.nextHourRain = weatherDataRaw ? weatherDataRaw.hourly[1].pop : null
  },

  // Set up the COVID data object.
  async setupCovid() {

    // Set up the COVID cache.
    const cacheCovidPath = this.fm.joinPath(this.fm.libraryDirectory(), "weather-cal-covid")
    const cacheCovidExists = this.fm.fileExists(cacheCovidPath)
    const cacheCovidDate = cacheCovidExists ? this.fm.modificationDate(cacheCovidPath) : 0
    let covidDataRaw

    // If cache exists and it's been less than 900 seconds (15min) since last request, use cached data.
    if (cacheCovidExists && (this.now.getTime() - cacheCovidDate.getTime()) < 900000) {
      const cacheCovid = this.fm.readString(cacheCovidPath)
      covidDataRaw = JSON.parse(cacheCovid)

    // Otherwise, use the API to get new data.
    } else {
      // Get yesterday's data using a different API with a history
      const covidReqYesterday = "https://api.covidtracking.com/v1/us/daily.json"  // TODO: make country a variable
      let covidDataRawYesterday = await new Request(covidReqYesterday).loadJSON()
      covidDataRawYesterday = covidDataRawYesterday[0]
      covidDataRawYesterday = (({ positiveIncrease, deathIncrease }) => ({ positiveIncrease, deathIncrease }))(covidDataRawYesterday)
      // Get today's data using the original API used by this script
      const covidReqToday = "https://coronavirus-19-api.herokuapp.com/countries/" + this.settings.covid.country
      let covidDataRawToday = await new Request(covidReqToday).loadJSON()
      // Combine today's data with a few fields from yesterday's data
      covidDataRaw = {
        ...covidDataRawToday,
        ...{
          yesterdayCases: covidDataRawYesterday['positiveIncrease'],
          yesterdayDeaths: covidDataRawYesterday['deathIncrease']
        }
      }
      this.fm.writeString(cacheCovidPath, JSON.stringify(covidDataRaw))
    }

    this.data.covid = covidDataRaw
  },

  /*
   * WIDGET ITEMS
   * These functions display items on the widget.
   * ============================================
   */

  // Display the date on the widget.
  async date(column) {

    // Get the settings.
    const dateSettings = this.settings.date

    // Requirements: events (if dynamicDateSize is enabled)
    if (!this.data.events && dateSettings.dynamicDateSize) { await this.setupEvents() }

    // Show small if it's hard coded, or if it's dynamic and events are visible.
    if (dateSettings.dynamicDateSize ? this.data.events.eventsAreVisible : dateSettings.staticDateSize == "small") {
      let dateStack = this.align(column)
      dateStack.setPadding(this.padding, this.padding, this.padding, this.padding)
      let dateText = this.provideText(this.formatDate(this.now,dateSettings.smallDateFormat), dateStack, this.format.smallDate)

    // Otherwise, show the large date.
    } else {
      let dateOneStack = this.align(column)
      let dateOne = this.provideText(this.formatDate(this.now,dateSettings.largeDateLineOne), dateOneStack, this.format.largeDate1)
      dateOneStack.setPadding(this.padding/2, this.padding, 0, this.padding)

      let dateTwoStack = this.align(column)
      let dateTwo = this.provideText(this.formatDate(this.now,dateSettings.largeDateLineTwo), dateTwoStack, this.format.largeDate2)
      dateTwoStack.setPadding(0, this.padding, this.padding, this.padding)
    }
  },

  // Display a time-based greeting on the widget.
  async greeting(column) {

    // This function makes a greeting based on the time of day.
    const localization = this.localization
    const hour = this.now.getHours()

    function makeGreeting() {
      if (hour    < 5)  { return localization.nightGreeting }
      if (hour    < 12) { return localization.morningGreeting }
      if (hour-12 < 5)  { return localization.afternoonGreeting }
      if (hour-12 < 10) { return localization.eveningGreeting }
      return localization.nightGreeting
    }

    // Set up the greeting.
    let greetingStack = this.align(column)
    let greeting = this.provideText(makeGreeting(), greetingStack, this.format.greeting)
    greetingStack.setPadding(this.padding, this.padding, this.padding, this.padding)
  },

  // Display events on the widget.
  async events(column) {

    // Requirements: events
    if (!this.data.events) { await this.setupEvents() }

    // Get the event data and settings.
    const eventData = this.data.events
    const eventSettings = this.settings.events

    // If no events are visible, figure out what to do.
    if (eventData.futureEvents.length == 0) { 
      const display = eventSettings.noEventBehavior

      // If it's a greeting, let the greeting function handle it.
      if (display == "greeting") { return await this.greeting(column) }

      // If it's a message, get the localized text.
      if (display == "message" && this.localization.noEventMessage.length) {
        const messageStack = this.align(column)
        messageStack.setPadding(this.padding, this.padding, this.padding, this.padding)
        this.provideText(this.localization.noEventMessage, messageStack, this.format.noEvents)
      }

      // Whether or not we displayed something, return here.
      return
    }

    // Set up the event stack.
    let eventStack = column.addStack()
    eventStack.layoutVertically()
    const todaySeconds = Math.floor(this.now.getTime() / 1000) - 978307200

    const defaultUrl = 'calshow:' + todaySeconds
    const settingUrlExists = (eventSettings.url || "").length > 0
    eventStack.url = settingUrlExists ? eventSettings.url : defaultUrl

    // If there are no events and we have a message, show it and return.
    if (!eventData.futureEvents.length && this.localization.noEventMessage.length) {
      let message = this.provideText(this.localization.noEventMessage, eventStack, this.format.noEvents)
      eventStack.setPadding(this.padding, this.padding, this.padding, this.padding)
      return
    }

    // If we're not showing the message, don't pad the event stack.
    eventStack.setPadding(0, 0, 0, 0)

    // Add each event to the stack.
    let currentStack = eventStack
    let currentDiff = 0
    const futureEvents = eventData.futureEvents
    const showCalendarColor = eventSettings.showCalendarColor
    const colorShape = showCalendarColor.includes("circle") ? "circle" : "rectangle"

    for (let i = 0; i < futureEvents.length; i++) {

      const event = futureEvents[i]
      const bottomPadding = (this.padding-10 < 0) ? 0 : this.padding-10

      // If it's a new day, set it up.
      const diff = this.dateDiff(this.now, event.startDate)
      if (diff != currentDiff) {
      
        // Move the loop along.
        currentDiff = diff
      
        // Make the stack and appropriate calendar link.
        const futureStack = column.addStack()
        futureStack.layoutVertically()
        const futureSeconds = Math.floor(this.now.getTime() / 1000) - 978307200 + (diff * 86400)
        futureStack.url = settingUrlExists ? eventSettings.url : 'calshow:' + futureSeconds
        currentStack = futureStack

        // Make the label.
        const eventLabelStack = this.align(currentStack)
        const tomorrowText = this.localization.tomorrowLabel
        const eventLabelText = (diff == 1 && tomorrowText.length) ? tomorrowText : this.formatDate(event.startDate,eventSettings.labelFormat)
        const eventLabel = this.provideText(eventLabelText.toUpperCase(), eventLabelStack, this.format.eventLabel)
        eventLabelStack.setPadding(this.padding, this.padding, this.padding, this.padding)
      }

      const titleStack = this.align(currentStack)
      titleStack.layoutHorizontally()

      // If we're showing a color, and it's not shown on the right, add it to the left.
      if (showCalendarColor.length && showCalendarColor != "none" && !showCalendarColor.includes("right")) {
        let colorItemText = this.provideTextSymbol(colorShape) + " "
        let colorItem = this.provideText(colorItemText, titleStack, this.format.eventTitle)
        colorItem.textColor = event.calendar.color
      }

      // Determine which elements will be shown.
      const showLocation = eventSettings.showLocation && event.location
      const showTime = !event.isAllDay

      // Set up the title.
      const title = this.provideText(event.title.trim(), titleStack, this.format.eventTitle)
      const titlePadding = (showLocation || showTime) ? this.padding/5 : this.padding
      titleStack.setPadding(this.padding, this.padding, titlePadding, this.padding)

      // If we're showing a color on the right, show it.
      if (showCalendarColor.length && showCalendarColor != "none" && showCalendarColor.includes("right")) {
        let colorItemText = " " + this.provideTextSymbol(colorShape)
        let colorItem = this.provideText(colorItemText, titleStack, this.format.eventTitle)
        colorItem.textColor = event.calendar.color
      }

      // If there are too many events, limit the line height.
      if (futureEvents.length >= 3) { title.lineLimit = 1 }

      // Show the location if enabled.
      if (showLocation) {
        const locationStack = this.align(currentStack)
        const location = this.provideText(event.location, locationStack, this.format.eventLocation)
        location.lineLimit = 1
        locationStack.setPadding(0, this.padding, showTime ? this.padding/5 : this.padding, this.padding)
      }

      // If it's an all-day event, we don't need a time.
      if (event.isAllDay) { continue }

      // Format the time information.
      let timeText = this.formatTime(event.startDate)

      // If we show the length as time, add an en dash and the time.
      if (eventSettings.showEventLength == "time") { 
        timeText += "–" + this.formatTime(event.endDate) 

      // If we should it as a duration, add the minutes.
      } else if (eventSettings.showEventLength == "duration") {
        const duration = (event.endDate.getTime() - event.startDate.getTime()) / (1000*60)
        const hours = Math.floor(duration/60)
        const minutes = Math.floor(duration % 60)
        const hourText = hours>0 ? hours + this.localization.durationHour : ""
        const minuteText = minutes>0 ? minutes + this.localization.durationMinute : ""
        const showSpace = hourText.length && minuteText.length
        timeText += " \u2022 " + hourText + (showSpace ? " " : "") + minuteText
      }

      const timeStack = this.align(currentStack)
      const time = this.provideText(timeText, timeStack, this.format.eventTime)
      timeStack.setPadding(0, this.padding, this.padding, this.padding)
    }
  },

  // Display reminders on the widget.
  async reminders(column) {

    // Requirements: reminders
    if (!this.data.reminders) { await this.setupReminders() }

    // Get the reminders data and settings.
    const reminderData = this.data.reminders
    const reminderSettings = this.settings.reminders
    
    // If no reminders are visible, figure out what to do.
    if (reminderData.all.length == 0) { 
      const display = reminderSettings.noRemindersBehavior

      // If it's a greeting, let the greeting function handle it.
      if (display == "greeting") { return await this.greeting(column) }

      // If it's a message, get the localized text.
      if (display == "message" && this.localization.noRemindersMessage.length) {
        const messageStack = this.align(column)
        messageStack.setPadding(this.padding, this.padding, this.padding, this.padding)
        this.provideText(this.localization.noRemindersMessage, messageStack, this.format.noReminders)
      }

      // Whether or not we displayed something, return here.
      return
    }

    // Set up the reminders stack.
    let reminderStack = column.addStack()
    reminderStack.layoutVertically()
    reminderStack.setPadding(0, 0, 0, 0)

    const defaultUrl = "x-apple-reminderkit://REMCDReminder/"
    const settingUrl = reminderSettings.url || ""
    reminderStack.url = (settingUrl.length > 0) ? settingUrl : defaultUrl

    // Add each reminder to the stack.
    const reminders = reminderData.all
    const showListColor = reminderSettings.showListColor
    const colorShape = showListColor.includes("circle") ? "circle" : "rectangle"

    for (let i = 0; i < reminders.length; i++) {

      const reminder = reminders[i]
      const bottomPadding = (this.padding-10 < 0) ? 0 : this.padding-10

      const titleStack = this.align(reminderStack)
      titleStack.layoutHorizontally()
      const showCalendarColor = reminderSettings.showListColor
      const colorShape = showListColor.includes("circle") ? "circle" : "rectangle"

      // If we're showing a color, and it's not shown on the right, add it to the left.
      if (showListColor.length && showListColor != "none" && !showListColor.includes("right")) {
        let colorItemText = this.provideTextSymbol(colorShape) + " "
        let colorItem = this.provideText(colorItemText, titleStack, this.format.reminderTitle)
        colorItem.textColor = reminder.calendar.color
      }

      const title = this.provideText(reminder.title.trim(), titleStack, this.format.reminderTitle)
      titleStack.setPadding(this.padding, this.padding, this.padding/5, this.padding)

      // If we're showing a color on the right, show it.
      if (showListColor.length && showListColor != "none" && showListColor.includes("right")) {
        let colorItemText = " " + this.provideTextSymbol(colorShape)
        let colorItem = this.provideText(colorItemText, titleStack, this.format.reminderTitle)
        colorItem.textColor = reminder.calendar.color
      }

      // If it doesn't have a due date, keep going.
      if (!reminder.dueDate) { continue }

      // If it's overdue, display in red without a time.
      if (reminder.isOverdue) { 
        title.textColor = Color.red()
        continue 
      }

      // Format with the relative style if set.
      let timeText
      if (reminderSettings.useRelativeDueDate) {
        let rdf = new RelativeDateTimeFormatter()
        rdf.locale = this.locale
        rdf.useNamedDateTimeStyle()
        timeText = rdf.string(reminder.dueDate, this.now)

      // Otherwise, use a normal date, time, or datetime format.
      } else {
        let df = new DateFormatter()
        df.locale = this.locale

        // If it's due today and it has a time, don't show the date.
        if (this.sameDay(reminder.dueDate, this.now) && reminder.dueDateIncludesTime) {
          df.useNoDateStyle()
        } else {
          df.useShortDateStyle()
        }

        // Only show the time if it's available.
        if (reminder.dueDateIncludesTime) {
          df.useShortTimeStyle()
        } else {
          df.useNoTimeStyle()
        }

        timeText = df.string(reminder.dueDate)
      }

      const timeStack = this.align(reminderStack)
      const time = this.provideText(timeText, timeStack, this.format.eventTime)
      timeStack.setPadding(0, this.padding, this.padding, this.padding)
    }
  },

  // Display the current weather.
  async current(column) {

    // Requirements: location, weather, and sunrise
    if (!this.data.location) { await this.setupLocation() }
    if (!this.data.weather) { await this.setupWeather() }
    if (!this.data.sun) { await this.setupSunrise() }

    // Get the relevant data and weather settings.
    const [locationData, weatherData, sunData] = [this.data.location, this.data.weather, this.data.sun]
    const weatherSettings = this.settings.weather

    // Set up the current weather stack.
    let currentWeatherStack = column.addStack()
    currentWeatherStack.layoutVertically()
    currentWeatherStack.setPadding(0, 0, 0, 0)

    const defaultUrl = "https://weather.com/" + this.locale + "/weather/today/l/" + locationData.latitude + "," + locationData.longitude
    const settingUrl = weatherSettings.urlCurrent || ""
    currentWeatherStack.url = (settingUrl.length > 0) ? settingUrl : defaultUrl

    // If we're showing the location, add it.
    if (weatherSettings.showLocation) {
      let locationTextStack = this.align(currentWeatherStack)
      let locationText = this.provideText(locationData.locality, locationTextStack, this.format.smallTemp)
      locationTextStack.setPadding(this.padding, this.padding, this.padding, this.padding)
    }

    // Show the current condition symbol.
    let mainConditionStack = this.align(currentWeatherStack)
    let mainCondition = mainConditionStack.addImage(this.provideConditionSymbol(weatherData.currentCondition,this.isNight(this.now)))
    mainCondition.imageSize = new Size(22,22)
    this.tintIcon(mainCondition, this.format.largeTemp)
    mainConditionStack.setPadding(weatherSettings.showLocation ? 0 : this.padding, this.padding, 0, this.padding)

    // Add the temp horizontally if enabled.
    if (weatherSettings.horizontalCondition) {
      mainConditionStack.addSpacer(5)
      mainConditionStack.layoutHorizontally()
      mainConditionStack.centerAlignContent()
      const tempText = this.displayNumber(weatherData.currentTemp,"--") + "°"
      const temp = this.provideText(tempText, mainConditionStack, this.format.largeTemp)
    }

    // If we're showing the description, add it.
    if (weatherSettings.showCondition) {
      let conditionTextStack = this.align(currentWeatherStack)
      let conditionText = this.provideText(weatherData.currentDescription, conditionTextStack, this.format.smallTemp)
      conditionTextStack.setPadding(this.padding, this.padding, 0, this.padding)
    }

    // Add the temp vertically if it's not horizontal.
    if (!weatherSettings.horizontalCondition) {
      const tempStack = this.align(currentWeatherStack)
      tempStack.setPadding(0, this.padding, 0, this.padding)
      const tempText = this.displayNumber(weatherData.currentTemp,"--") + "°"
      const temp = this.provideText(tempText, tempStack, this.format.largeTemp)
    }

    // If we're not showing the high and low, end it here.
    if (!weatherSettings.showHighLow) { return }

    // Show the temp bar and high/low values.
    let tempBarStack = this.align(currentWeatherStack)
    tempBarStack.layoutVertically()
    tempBarStack.setPadding(0, this.padding, this.padding, this.padding)

    let tempBar = this.drawTempBar()
    let tempBarImage = tempBarStack.addImage(tempBar)
    tempBarImage.size = new Size(50,0)

    tempBarStack.addSpacer(1)

    let highLowStack = tempBarStack.addStack()
    highLowStack.layoutHorizontally()

    const mainLowText = this.displayNumber(weatherData.todayLow,"-")
    const mainLow = this.provideText(mainLowText, highLowStack, this.format.tinyTemp)
    highLowStack.addSpacer()
    const mainHighText = this.displayNumber(weatherData.todayHigh,"-")
    const mainHigh = this.provideText(mainHighText, highLowStack, this.format.tinyTemp)

    tempBarStack.size = new Size(60,30)
  },

  // Display upcoming weather.
  async future(column) {

    // Requirements: location, weather, and sunrise
    if (!this.data.location) { await this.setupLocation() }
    if (!this.data.weather) { await this.setupWeather() }
    if (!this.data.sun) { await this.setupSunrise() }

    // Get the relevant data and weather settings.
    const [locationData, weatherData, sunData] = [this.data.location, this.data.weather, this.data.sun]
    const weatherSettings = this.settings.weather

    // Set up the future weather stack.
    let futureWeatherStack = column.addStack()
    futureWeatherStack.layoutVertically()
    futureWeatherStack.setPadding(0, 0, 0, 0)
    
    // Determine if we should show the next hour.
    const showNextHour = (this.now.getHours() < parseInt(weatherSettings.tomorrowShownAtHour))

    const defaultUrl = "https://weather.com/" + this.locale + "/weather/" + (showNextHour ? "today" : "tenday") +"/l/" + locationData.latitude + "," + locationData.longitude
    const settingUrl = showNextHour ? (weatherSettings.urlFuture || "") : (weatherSettings.urlForecast || "")
    futureWeatherStack.url = (settingUrl.length > 0) ? settingUrl : defaultUrl

    // Set the label value.
    const subLabelStack = this.align(futureWeatherStack)
    const subLabelText = showNextHour ? this.localization.nextHourLabel : this.localization.tomorrowLabel
    const subLabel = this.provideText(subLabelText, subLabelStack, this.format.smallTemp)
    subLabelStack.setPadding(0, this.padding, this.padding/2, this.padding)

    // Set up the sub condition stack.
    let subConditionStack = this.align(futureWeatherStack)
    subConditionStack.layoutHorizontally()
    subConditionStack.centerAlignContent()
    subConditionStack.setPadding(0, this.padding, this.padding, this.padding)

    // Determine if it will be night in the next hour.
    var nightCondition
    if (showNextHour) {
      const addHour = this.now.getTime() + (60*60*1000)
      const newDate = new Date(addHour)
      nightCondition = this.isNight(newDate)
    } else {
      nightCondition = false 
    }

    let subCondition = subConditionStack.addImage(this.provideConditionSymbol(showNextHour ? weatherData.hourly[1].Condition : weatherData.forecast[1].Condition,nightCondition))
    const subConditionSize = showNextHour ? 14 : 18
    subCondition.imageSize = new Size(subConditionSize, subConditionSize)
    this.tintIcon(subCondition, this.format.smallTemp)
    subConditionStack.addSpacer(5)

    // The next part of the display changes significantly for next hour vs tomorrow.
    let rainPercent
    if (showNextHour) {
      const subTempText = this.displayNumber(weatherData.hourly[1].Temp,"--") + "°"
      const subTemp = this.provideText(subTempText, subConditionStack, this.format.smallTemp)
      rainPercent = weatherData.nextHourRain

    } else {
      let tomorrowLine = subConditionStack.addImage(this.drawVerticalLine(new Color((this.format.tinyTemp && this.format.tinyTemp.color) ? this.format.tinyTemp.color : this.format.defaultText.color, 0.5), 20))
      tomorrowLine.imageSize = new Size(3,28)
      subConditionStack.addSpacer(5)
      let tomorrowStack = subConditionStack.addStack()
      tomorrowStack.layoutVertically()

      const tomorrowHighText = this.displayNumber(weatherData.forecast[1].High,"-")
      const tomorrowHigh = this.provideText(tomorrowHighText, tomorrowStack, this.format.tinyTemp)
      tomorrowStack.addSpacer(4)
      const tomorrowLowText = this.displayNumber(weatherData.forecast[1].Low,"-")
      const tomorrowLow = this.provideText(tomorrowLowText, tomorrowStack, this.format.tinyTemp)
      rainPercent = (weatherData.tomorrowRain == null ? "--" : weatherData.tomorrowRain*100)
    }

    // If we're showing rain percentage, add it.
    if (weatherSettings.showRain) {
      let subRainStack = this.align(futureWeatherStack)
      subRainStack.layoutHorizontally()
      subRainStack.centerAlignContent()
      subRainStack.setPadding(0, this.padding, this.padding, this.padding)

      let subRain = subRainStack.addImage(SFSymbol.named("umbrella").image)
      const subRainSize = showNextHour ? 14 : 18
      subRain.imageSize = new Size(subRainSize, subRainSize)
      subRain.tintColor = new Color((this.format.smallTemp && this.format.smallTemp.color) ? this.format.smallTemp.color : this.format.defaultText.color)
      subRainStack.addSpacer(5)

      const subRainText = this.displayNumber(rainPercent,"--") + "%"
      this.provideText(subRainText, subRainStack, this.format.smallTemp)
    }
  },

  // Display forecast weather.
  async forecast(column, hourly = false) {

    // Requirements: location, weather, and sunrise
    if (!this.data.location) { await this.setupLocation() }
    if (!this.data.weather) { await this.setupWeather() }
    if (!this.data.sun) { await this.setupSunrise() }

    // Get the relevant data and weather settings.
    const [locationData, weatherData, sunData] = [this.data.location, this.data.weather, this.data.sun]
    const weatherSettings = this.settings.weather

    let startIndex = hourly ? 1 : (weatherSettings.showToday ? 1 : 2)
    let endIndex = (hourly ? parseInt(weatherSettings.showHours) : parseInt(weatherSettings.showDays)) + startIndex
    if (endIndex > 9) { endIndex = 9 }

    const defaultUrl = "https://weather.com/" + this.locale + "/weather/" + (hourly ? "today" : "tenday") + "/l/" + locationData.latitude + "," + locationData.longitude
    const settingUrl = hourly ? (weatherSettings.urlFuture || "") : (weatherSettings.urlForecast || "")
    const urlToUse = (settingUrl.length > 0) ? settingUrl : defaultUrl
    const horizontal = hourly ? weatherSettings.horizontalHours : weatherSettings.horizontalForecast
    const spacing = (weatherSettings.spacing ? parseInt(weatherSettings.spacing) : 0) + (horizontal ? 0 : 5)
    
    // Set up the overall container.
    let weatherStack = this.align(column)
    weatherStack.url = urlToUse
    
    const outsidePadding = this.padding > spacing ? this.padding - spacing : 0
    if (horizontal) { 
      weatherStack.layoutHorizontally()
      weatherStack.setPadding(this.padding, outsidePadding, this.padding, outsidePadding)
    } else {
      weatherStack.layoutVertically()
      weatherStack.setPadding(outsidePadding, this.padding, outsidePadding, this.padding)
    }

    let myDate = new Date()
    if (!hourly && startIndex == 1) { myDate.setDate(myDate.getDate() - 1) }
    const type = hourly ? "hourly" : "forecast"
    const format = hourly ? weatherSettings.showHoursFormat : weatherSettings.showDaysFormat

    for (var i=startIndex; i < endIndex; i++) {
      
      // Get the right date.
      if (hourly) { myDate.setHours(myDate.getHours() + 1) }
      else { myDate.setDate(myDate.getDate() + 1) }
    
      // Create the appropriate container stack.
      let unitStack = weatherStack.addStack()
      let dateStack = unitStack.addStack()
      
      // Get the right spacing.
      const edgePadding = this.padding > spacing ? spacing : this.padding
      const initialSpace = (i == startIndex) ? edgePadding : spacing
      const finalSpace = (i == endIndex-1) ? edgePadding : spacing
      
      const fontSize = (this.format.smallTemp && this.format.smallTemp.size) ? this.format.smallTemp.size : this.format.defaultText.size
      const stackSize = hourly ? new Size(fontSize*3,0) : new Size(fontSize*2.64,0)
      
      if (horizontal) {
        unitStack.setPadding(0, initialSpace, 0, finalSpace)
        unitStack.layoutVertically()
        
        dateStack.addSpacer()
        this.provideText(this.formatDate(myDate,format), dateStack, this.format.smallTemp)
        dateStack.addSpacer()
        
      } else {
        unitStack.setPadding(initialSpace, 0, finalSpace, 0)
        unitStack.layoutHorizontally()
        
        dateStack.layoutHorizontally()
        dateStack.setPadding(0, 0, 0, 0)
        dateStack.size = stackSize
        
        let dateText = this.provideText(this.formatDate(myDate,format), dateStack, this.format.smallTemp)
        dateText.lineLimit = 1
        dateText.minimumScaleFactor = 0.5
        dateStack.addSpacer()
      }
      
      unitStack.centerAlignContent()
      unitStack.addSpacer(5)
      
      let conditionStack = unitStack.addStack()
      conditionStack.centerAlignContent()
      conditionStack.layoutHorizontally()
      if (horizontal) { conditionStack.addSpacer() }
      
      // Now, set up the container for the condition.
      if (hourly) {
        let subCondition = conditionStack.addImage(this.provideConditionSymbol(weatherData.hourly[i - 1].Condition, this.isNight(myDate)))
        subCondition.imageSize = new Size(18,18)
        this.tintIcon(subCondition, this.format.smallTemp)
        
        if (horizontal) { conditionStack.addSpacer() }
        unitStack.addSpacer(5)
        
        let tempStack = unitStack.addStack()
        tempStack.centerAlignContent()
        tempStack.layoutHorizontally()
        
        if (horizontal) { tempStack.addSpacer() }
        const tempText = this.displayNumber(weatherData.hourly[i - 1].Temp,"--") + "°"
        const temp = this.provideText(tempText, tempStack, this.format.smallTemp)
        temp.lineLimit = 1
        temp.minimumScaleFactor = 0.75
        if (horizontal) { 
          temp.size = stackSize
          tempStack.addSpacer() 
        }
        
      } else { 
        const tinyFont = (this.format.tinyTemp && this.format.tinyTemp.size) ? this.format.tinyTemp.size : this.format.defaultText.size
        conditionStack.size = new Size(0,tinyFont*2.64)
      
        let subCondition = conditionStack.addImage(this.provideConditionSymbol(weatherData.forecast[i - 1].Condition, false))
        subCondition.imageSize = new Size(18,18)
        this.tintIcon(subCondition, this.format.smallTemp)
        conditionStack.addSpacer(5)

        let tempLine = conditionStack.addImage(this.drawVerticalLine(new Color((this.format.tinyTemp && this.format.tinyTemp.color) ? this.format.tinyTemp.color : this.format.defaultText.color, 0.5), 20))
        tempLine.imageSize = new Size(3,28)
        conditionStack.addSpacer(5)
        let tempStack = conditionStack.addStack()
        tempStack.layoutVertically()
        
        const tinyFontSize = (this.format.tinyTemp && this.format.tinyTemp.size) ? this.format.tinyTemp.size : this.format.defaultText.size
        tempStack.size = hourly ? new Size(fontSize*1,0) : new Size(fontSize*1,0)

        const tempHighText = this.displayNumber(weatherData.forecast[i - 1].High,"-")
        const tempHigh = this.provideText(tempHighText, tempStack, this.format.tinyTemp)
        tempHigh.lineLimit = 1
        tempHigh.minimumScaleFactor = 0.6
        tempStack.addSpacer(4)
        const tempLowText = this.displayNumber(weatherData.forecast[i - 1].Low,"-")
        const tempLow = this.provideText(tempLowText, tempStack, this.format.tinyTemp)
        tempLow.lineLimit = 1
        tempLow.minimumScaleFactor = 0.6
      
        if (horizontal) { conditionStack.addSpacer() }
      }
    }
  },
  
  // Allow both terms to be used.
  async daily(column) {
    await this.forecast(column)
  },
  
  // Display an hourly forecast.
  async hourly(column) {
    await this.forecast(column, true)
  },

  // Add a battery element to the widget.
  async battery(column) {

    // Set up the battery level item.
    const batteryStack = this.align(column)
    batteryStack.layoutHorizontally()
    batteryStack.centerAlignContent()
    batteryStack.setPadding(this.padding/2, this.padding, this.padding/2, this.padding)

    // Set up the battery icon.
    const batteryIcon = batteryStack.addImage(this.provideBatteryIcon(Device.batteryLevel(),Device.isCharging()))
    batteryIcon.imageSize = new Size(30,18)

    // Change the battery icon to red if battery level is less than 20%.
    const batteryLevel = Math.round(Device.batteryLevel() * 100)
    if (batteryLevel > 20 || Device.isCharging() ) {
      this.tintIcon(batteryIcon,this.format.battery,true)
    } else {
      batteryIcon.tintColor = Color.red()
    }

    // Format the rest of the item.
    batteryStack.addSpacer(this.padding * 0.6)
    this.provideText(batteryLevel + "%", batteryStack, this.format.battery)
  },

  // Show the sunrise or sunset time.
  async sunrise(column, showSunset = false) {

    // Requirements: sunrise
    if (!this.data.sun) { await this.setupSunrise() }

    // Get the sunrise data and settings.
    const sunData = this.data.sun
    const sunSettings = this.settings.sunrise

    const sunrise = sunData.sunrise
    const sunset = sunData.sunset
    const tomorrow = sunData.tomorrow
    const current = this.now.getTime()

    const showWithin = parseInt(sunSettings.showWithin)
    const nearSunrise = this.closeTo(sunrise) <= showWithin
    const nearSunset = this.closeTo(sunset) <= showWithin

    // If we only show sometimes and we're not close, return.
    if (showWithin > 0 && !nearSunrise && !nearSunset) { return }

    // Otherwise, determine which time to show.
    let timeToShow, symbolName
    const halfHour = 30 * 60 * 1000

    // Determine logic for when to show sunset for a combined element.
    const combinedSunset = current > sunrise + halfHour && current < sunset + halfHour

    // Determine if we should show the sunset.
    if (sunSettings.separateElements ? showSunset : combinedSunset) {
      symbolName = "sunset.fill"
      timeToShow = sunset
    }

    // Otherwise, show a sunrise.
    else {
      symbolName = "sunrise.fill"
      timeToShow = current > sunset ? tomorrow : sunrise
    }

    // Set up the stack.
    const sunriseStack = this.align(column)
    sunriseStack.setPadding(this.padding/2, this.padding, this.padding/2, this.padding)
    sunriseStack.layoutHorizontally()
    sunriseStack.centerAlignContent()

    sunriseStack.addSpacer(this.padding * 0.3)

    // Add the correct symbol.
    const symbol = sunriseStack.addImage(SFSymbol.named(symbolName).image)
    symbol.imageSize = new Size(18,18)
    this.tintIcon(symbol, this.format.sunrise)

    sunriseStack.addSpacer(this.padding)

    // Add the time.
    const timeText = this.formatTime(new Date(timeToShow))
    const time = this.provideText(timeText, sunriseStack, this.format.sunrise)
  },

  // Allow for either term to be used.
  async sunset(column) {
    return await this.sunrise(column, true)
  },

  // Add custom text to the column.
  text(column, input) {
    
    // If there was no input, don't do anything.
    if (!input || input == "") { return }

    // Otherwise, add the text.
    const textStack = this.align(column)
    textStack.setPadding(this.padding, this.padding, this.padding, this.padding)
    const textDisplay = this.provideText(input, textStack, this.format.customText)

  },

  // Display COVID info on the widget.
  async covid(column) {

    // Requirements: sunrise
    if (!this.data.covid) { await this.setupCovid() }

    // Get the sunrise data and settings.
    const covidData = this.data.covid
    const covidSettings = this.settings.covid

    // Set up the stack.
    const covidStack = this.align(column)
    covidStack.setPadding(this.padding/2, this.padding, this.padding/2, this.padding)
    covidStack.layoutHorizontally()
    covidStack.centerAlignContent()
    covidStack.url = covidSettings.url

    covidStack.addSpacer(this.padding * 0.3)

    // Add the correct symbol.
    const symbol = covidStack.addImage(SFSymbol.named("bandage").image)
    symbol.imageSize = new Size(18,18)
    this.tintIcon(symbol,this.format.covid,true)

    covidStack.addSpacer(this.padding)

    // Add the COVID information.
    const locale = this.locale
    const covidText = this.localization.covid.replace(/{(.*?)}/g, (match, $1) => {
      let val = covidData[$1]
      if (val) val = new Intl.NumberFormat(locale.replace('_','-')).format(val)
      return val || ""
    })
    this.provideText(covidText, covidStack, this.format.covid)

  },

  // Display week number for current date.
  async week(column) {

    // Set up the stack.
    const weekStack = this.align(column)
    weekStack.setPadding(this.padding/2, this.padding, 0, this.padding)
    weekStack.layoutHorizontally()
    weekStack.centerAlignContent()

    // Add the week information.
    var currentThursday = new Date(this.now.getTime() +(3-((this.now.getDay()+6) % 7)) * 86400000)
    var yearOfThursday = currentThursday.getFullYear()
    var firstThursday = new Date(new Date(yearOfThursday,0,4).getTime() +(3-((new Date(yearOfThursday,0,4).getDay()+6) % 7)) * 86400000)
    var weekNumber = Math.floor(1 + 0.5 + (currentThursday.getTime() - firstThursday.getTime()) / 86400000/7) + ""
    var weekText = this.localization.week + " " + weekNumber
    this.provideText(weekText, weekStack, this.format.week)
  },
  
  symbol(column, name) {

    if (!name || !SFSymbol.named(name)) { return }

    const symSettings = this.settings.symbol
    const symbolPad = symSettings.padding || {}
    const topPad    = (symbolPad.top && symbolPad.top.length) ? parseInt(symbolPad.top) : this.padding
    const leftPad   = (symbolPad.left && symbolPad.left.length) ? parseInt(symbolPad.left) : this.padding
    const bottomPad = (symbolPad.bottom && symbolPad.bottom.length) ? parseInt(symbolPad.bottom) : this.padding
    const rightPad  = (symbolPad.right && symbolPad.right.length) ? parseInt(symbolPad.right) : this.padding
    
    const stack = this.align(column)
    stack.setPadding(topPad, leftPad, bottomPad, rightPad)

    const symbol = stack.addImage(SFSymbol.named(name).image)
    const size = symSettings.size.length > 0 ? parseInt(symSettings.size) : column.size.width - (this.padding * 4)
    symbol.imageSize = new Size(size, size)
    if (symSettings.tintColor.length > 0) { symbol.tintColor = new Color(symSettings.tintColor) }
  },

  /*
   * HELPER FUNCTIONS
   * These functions perform duties for other functions.
   * ===================================================
   */

  // Returns a rounded number string or the provided dummy text.
  displayNumber(number,dummy = "-") {
    return (number == null ? dummy : Math.round(number).toString())
  },

  // Tints icons if needed or forced.
  tintIcon(icon,format,force = false) {
    // Don't tint if the setting is off and we're not forced.
    if (!this.tintIcons && !force) { return }
    icon.tintColor = new Color((format && format.color) ? format.color : this.format.defaultText.color)
  },

  // Determines if the provided date is at night.
  isNight(dateInput) {
    const timeValue = dateInput.getTime()
    return (timeValue < this.data.sun.sunrise) || (timeValue > this.data.sun.sunset)
  },

  // Determines if two dates occur on the same day.
  sameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
  },
  
  // Returns the difference in days between two dates. Adapted from StackOverflow.
  dateDiff(first, second) {
    const firstDate = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 0, 0, 0)
    const secondDate = new Date(second.getFullYear(), second.getMonth(), second.getDate(), 0, 0, 0)
    return Math.round((secondDate-firstDate)/(1000*60*60*24))
  },

  // Returns the number of minutes between now and the provided date.
  closeTo(time) {
    return Math.abs(this.now.getTime() - time) / 60000
  },

  // Format the time for a Date input.
  formatTime(date) {
    const df = new DateFormatter()
    df.locale = this.locale
    df.useNoDateStyle()
    df.useShortTimeStyle()
    return df.string(date)
  },
  
  // Format the date for a Date input and format string.
  formatDate(date,format) {
    const df = new DateFormatter()
    df.locale = this.locale
    df.dateFormat = format
    return df.string(date)
  },

  // Provide a text symbol with the specified shape.
  provideTextSymbol(shape) {

    // Rectangle character.
    if (shape.startsWith("rect")) {
      return "\u2759"
    }
    // Circle character.
    if (shape == "circle") {
      return "\u2B24"
    }
    // Default to the rectangle.
    return "\u2759" 
  },

  // Provide a battery SFSymbol with accurate level drawn on top of it.
  provideBatteryIcon(batteryLevel,charging = false) {

    // If we're charging, show the charging icon.
    if (charging) { return SFSymbol.named("battery.100.bolt").image }

    // Set the size of the battery icon.
    const batteryWidth = 87
    const batteryHeight = 41

    // Start our draw context.
    let draw = new DrawContext()
    draw.opaque = false
    draw.respectScreenScale = true
    draw.size = new Size(batteryWidth, batteryHeight)

    // Draw the battery.
    draw.drawImageInRect(SFSymbol.named("battery.0").image, new Rect(0, 0, batteryWidth, batteryHeight))

    // Match the battery level values to the SFSymbol.
    const x = batteryWidth*0.1525
    const y = batteryHeight*0.247
    const width = batteryWidth*0.602
    const height = batteryHeight*0.505

    // Prevent unreadable icons.
    let level = batteryLevel
    if (level < 0.05) { level = 0.05 }

    // Determine the width and radius of the battery level.
    const current = width * level
    let radius = height/6.5

    // When it gets low, adjust the radius to match.
    if (current < (radius * 2)) { radius = current / 2 }

    // Make the path for the battery level.
    let barPath = new Path()
    barPath.addRoundedRect(new Rect(x, y, current, height), radius, radius)
    draw.addPath(barPath)
    draw.setFillColor(Color.black())
    draw.fillPath()
    return draw.getImage()
  },

  // Provide a symbol based on the condition.
  provideConditionSymbol(cond,night) {

    // Define our symbol equivalencies.
    let symbols = {

      // Error
      "1": function() { return "exclamationmark.circle" },

      // Thunderstorm
      "2": function() { return "cloud.bolt.rain.fill" },

      // Drizzle
      "3": function() { return "cloud.drizzle.fill" },

      // Rain
      "5": function() { return (cond == 511) ? "cloud.sleet.fill" : "cloud.rain.fill" },

      // Snow
      "6": function() { return (cond >= 611 && cond <= 613) ? "cloud.snow.fill" : "snow" },

      // Atmosphere
      "7": function() {
        if (cond == 781) { return "tornado" }
        if (cond == 701 || cond == 741) { return "cloud.fog.fill" }
        return night ? "cloud.fog.fill" : "sun.haze.fill"
      },

      // Clear and clouds
      "8": function() {
        if (cond == 800 || cond == 801) { return night ? "moon.stars.fill" : "sun.max.fill" }
        if (cond == 802 || cond == 803) { return night ? "cloud.moon.fill" : "cloud.sun.fill" }
        return "cloud.fill"
      }
    }

    // Find out the first digit.
    let conditionDigit = Math.floor(cond / 100)

    // Get the symbol.
    return SFSymbol.named(symbols[conditionDigit]()).image
  },

  // Provide a font based on the input.
  provideFont(fontName, fontSize) {
    const fontGenerator = {
      ultralight() { return Font.ultraLightSystemFont(fontSize) },
      light()      { return Font.lightSystemFont(fontSize) },
      regular()    { return Font.regularSystemFont(fontSize) },
      medium()     { return Font.mediumSystemFont(fontSize) },
      semibold()   { return Font.semiboldSystemFont(fontSize) },
      bold()       { return Font.boldSystemFont(fontSize) },
      heavy()      { return Font.heavySystemFont(fontSize) },
      black()      { return Font.blackSystemFont(fontSize) },
      italic()     { return Font.italicSystemFont(fontSize) },
    }

    const systemFont = fontGenerator[fontName]
    if (systemFont) { return systemFont() }
    return new Font(fontName, fontSize)
  },

  // Add formatted text to a container.
  provideText(string, container, format) {
    const defaultText = this.format.defaultText
    const textItem = container.addText(string)
    const textFont = (format && format.font) ? format.font : defaultText.font
    const textSize = (format && format.size) ? format.size : defaultText.size
    const textColor = (format && format.color) ? format.color : defaultText.color

    textItem.font = this.provideFont(textFont, parseInt(textSize))
    textItem.textColor = new Color(textColor)
    return textItem
  },

  /*
   * DRAWING FUNCTIONS
   * These functions draw onto a canvas.
   * ===================================
   */

  // Draw the vertical line in the tomorrow view.
  drawVerticalLine(color, height) {

    const width = 2

    let draw = new DrawContext()
    draw.opaque = false
    draw.respectScreenScale = true
    draw.size = new Size(width,height)

    let barPath = new Path()
    const barHeight = height
    barPath.addRoundedRect(new Rect(0, 0, width, height), width/2, width/2)
    draw.addPath(barPath)
    draw.setFillColor(color)
    draw.fillPath()

    return draw.getImage()
  },

  // Draw the temp bar.
  drawTempBar() {

    // Set the size of the temp bar.
    const tempBarWidth = 200
    const tempBarHeight = 20

    // Get the weather data.
    const weatherData = this.data.weather

    // Calculate the current percentage of the high-low range.
    let percent = (weatherData.currentTemp - weatherData.todayLow) / (weatherData.todayHigh - weatherData.todayLow)

    // If we're out of bounds, clip it.
    if (percent < 0) {
      percent = 0
    } else if (percent > 1) {
      percent = 1
    }

    // Determine the scaled x-value for the current temp.
    const currPosition = (tempBarWidth - tempBarHeight) * percent

    // Start our draw context.
    let draw = new DrawContext()
    draw.opaque = false
    draw.respectScreenScale = true
    draw.size = new Size(tempBarWidth, tempBarHeight)

    // Make the path for the bar.
    let barPath = new Path()
    const barHeight = tempBarHeight - 10
    barPath.addRoundedRect(new Rect(0, 5, tempBarWidth, barHeight), barHeight / 2, barHeight / 2)
    draw.addPath(barPath)

    // Determine the color.
    const barColor = (this.format.tinyTemp && this.format.tinyTemp.color) ? this.format.tinyTemp.color : this.format.defaultText.color
    draw.setFillColor(new Color(barColor, 0.5))
    draw.fillPath()

    // Make the path for the current temp indicator.
    let currPath = new Path()
    currPath.addEllipse(new Rect(currPosition, 0, tempBarHeight, tempBarHeight))
    draw.addPath(currPath)
    draw.setFillColor(new Color(barColor, 1))
    draw.fillPath()

    return draw.getImage()
  },
  
  // Return the default widget settings.
  defaultSettings() {
    const settings = {

      widget: {
        name: "Overall settings",
        locale: {
          val: "",
          name: "Locale code",
          description: "Leave blank to match the device's locale.",
        },
        units: {
          val: "imperial",
          name: "Units",
          description: "Use imperial for Fahrenheit or metric for Celsius.",
          type: "enum",
          options: ["imperial","metric"],
        },
        preview: {
          val: "large",
          name: "Widget preview size",
          description: "Set the size of the widget preview displayed in the app.",
          type: "enum",
          options: ["small","medium","large"],
        },
        padding: {
          val: "5",
          name: "Item padding",
          description: "The padding around each item. This also determines the approximate widget padding. Default is 5.",
        },
        widgetPadding: {
          val: { top: "", left: "", bottom: "", right: "" },
          name: "Custom widget padding",
          type: "multival",
          description: "The padding around the entire widget. By default, these values are blank and Weather Cal uses the item padding to determine these values. Transparent widgets often look best with these values at 0.",
        },
        tintIcons: {
          val: false,
          name: "Icons match text color",
          description: "Decide if icons should match the color of the text around them.",
          type: "bool",
        },
      },

      localization: {
        name: "Localization and text customization",
        morningGreeting: {
          val: "Good morning.",
          name: "Morning greeting",
        },
        afternoonGreeting: {
          val: "Good afternoon.",
          name: "Afternoon greeting",
        },
        eveningGreeting: {
          val: "Good evening.",
          name: "Evening greeting",
        },
        nightGreeting: {
          val: "Good night.",
          name: "Night greeting",
        },
        nextHourLabel: {
          val: "Next hour",
          name: "Label for next hour of weather",
        },
        tomorrowLabel: {
          val: "Tomorrow",
          name: "Label for tomorrow",
        },
        noEventMessage: {
          val: "Enjoy the rest of your day.",
          name: "No event message",
          description: "The message shown when there are no more events for the day, if that setting is active.",
        },
        noRemindersMessage: {
          val: "Tasks complete.",
          name: "No reminders message",
          description: "The message shown when there are no more reminders for the day, if that setting is active.",
        },
        durationMinute: {
          val: "m",
          name: "Duration label for minutes",
        },
        durationHour: {
          val: "h",
          name: "Duration label for hours",
        },
        covid: {
          val: "{cases} cases, {deaths} deaths, {recovered} recoveries",
          name: "COVID data text",
          description: "Each {token} is replaced with the number from the data. The available tokens are: cases, todayCases, yesterdayCases, deaths, todayDeaths, yesterdayDeaths, recovered, active, critical, casesPerOneMillion, deathsPerOneMillion, totalTests, testsPerOneMillion"
        },
        week: {
          val: "Week",
          name: "Label for the week number",
        },
      },

      font: {
        name: "Text sizes, colors, and fonts",
        defaultText: {
          val: { size: "14", color: "ffffff", font: "regular" },
          name: "Default font settings",
          description: "These settings apply to all text on the widget that doesn't have a customized value.",
          type: "multival",
        },
        smallDate:   {
          val: { size: "17", color: "", font: "semibold" },
          name: "Small date",
          type: "multival",
        },
        largeDate1:  {
          val: { size: "30", color: "", font: "light" },
          name: "Large date, line 1",
          type: "multival",
        },
        largeDate2:  {
          val: { size: "30", color: "", font: "light" },
          name: "Large date, line 2",
          type: "multival",
        },
        greeting:    {
          val: { size: "30", color: "", font: "semibold" },
          name: "Greeting",
          type: "multival",
        },
        eventLabel:  {
          val: { size: "14", color: "", font: "semibold" },
          name: "Event heading (used for the TOMORROW label)",
          type: "multival",
        },
        eventTitle:  {
          val: { size: "14", color: "", font: "semibold" },
          name: "Event title",
          type: "multival",
        },
        eventLocation:   {
          val: { size: "14", color: "", font: "" },
          name: "Event location",
          type: "multival",
        },
        eventTime:   {
          val: { size: "14", color: "ffffffcc", font: "" },
          name: "Event time",
          type: "multival",
        },
        noEvents:    {
          val: { size: "30", color: "", font: "semibold" },
          name: "No events message",
          type: "multival",
        },
        reminderTitle:  {
          val: { size: "14", color: "", font: "" },
          name: "Reminder title",
          type: "multival",
        },
        reminderTime:   {
          val: { size: "14", color: "ffffffcc", font: "" },
          name: "Reminder time",
          type: "multival",
        },
        noReminders:    {
          val: { size: "30", color: "", font: "semibold" },
          name: "No reminders message",
          type: "multival",
        },
        largeTemp:   {
          val: { size: "34", color: "", font: "light" },
          name: "Large temperature label",
          type: "multival",
        },
        smallTemp:   {
          val: { size: "14", color: "", font: "" },
          name: "Most text used in weather items",
          type: "multival",
        },
        tinyTemp:    {
          val: { size: "12", color: "", font: "" },
          name: "Small text used in weather items",
          type: "multival",
        },
        customText:  {
          val: { size: "14", color: "", font: "" },
          name: "User-defined text items",
          type: "multival",
        },
        battery:     {
          val: { size: "14", color: "", font: "medium" },
          name: "Battery percentage",
          type: "multival",
        },
        sunrise:     {
          val: { size: "14", color: "", font: "medium" },
          name: "Sunrise and sunset",
          type: "multival",
        },
        covid:       {
          val: { size: "14", color: "", font: "medium" },
          name: "COVID data",
          type: "multival",
        },
        week:        {
          val: { size: "14", color: "", font: "light" },
          name: "Week label",
          type: "multival",
        },
      },

      date: {
        name: "Date",
        dynamicDateSize: {
          val: true,
          name: "Dynamic date size",
          description: "If set to true, the date will become smaller when events are displayed.",
          type: "bool",
        },
        staticDateSize: {
          val: "small",
          name: "Static date size",
          description: "Set the date size shown when dynamic date size is not enabled.",
          type: "enum",
          options: ["small","large"],
        },
        smallDateFormat: {
          val: "EEEE, MMMM d",
          name: "Small date format",
        },
        largeDateLineOne: {
          val: "EEEE,",
          name: "Large date format, line 1",
        }, 
        largeDateLineTwo: {
          val: "MMMM d",
          name: "Large date format, line 2",
        }, 
      },

      events: {
        name: "Events",
        numberOfEvents: {
          val: "3",
          name: "Maximum number of events shown",
        }, 
        minutesAfter: {
          val: "5",
          name: "Minutes after event begins",
          description: "Number of minutes after an event begins that it should still be shown.",
        }, 
        showAllDay: {
          val: false,
          name: "Show all-day events",
          type: "bool",        
        },
        numberOfDays: {
          val: "1",
          name: "How many future days of events to show",
          description: "How many days to show into the future. Set to 0 to show today's events only. The maximum is 7.",
        }, 
        labelFormat: {
          val: "EEEE, MMMM d",
          name: "Date format for future event days",
        }, 
        showTomorrow: {
          val: "20",
          name: "Future days shown at hour",
          description: "The hour (in 24-hour time) to start showing events for tomorrow or beyond. Use 0 for always, 24 for never.",
        }, 
        showEventLength: {
          val: "duration",
          name: "Event length display style",
          description: "Choose whether to show the duration, the end time, or no length information.",
          type: "enum",
          options: ["duration","time","none"],
        }, 
        showLocation: {
          val: false,
          name: "Show event location",
          type: "bool",        
        },
        selectCalendars: {
          val: "",
          name: "Calendars to show",
          description: "Write the names of each calendar separated by commas, like this: Home,Work,Personal. Leave blank to show events from all calendars.",
        }, 
        showCalendarColor: {
          val: "rectangle left",
          name: "Display calendar color",
          description: "Choose the shape and location of the calendar color.",
          type: "enum",
          options: ["rectangle left","rectangle right","circle left","circle right","none"],
        }, 
        noEventBehavior: {
          val: "message",
          name: "Show when no events remain",
          description: "When no events remain, show a hard-coded message, a time-based greeting, or nothing.",
          type: "enum",
          options: ["message","greeting","none"],
        }, 
        url: {
          val: "",
          name: "URL to open when tapped",
          description: "Optionally provide a URL to open when this item is tapped. Leave blank to open the built-in Calendar app.",
        }, 
      },

      reminders: {
        name: "Reminders",
        numberOfReminders: {
          val: "3",
          name: "Maximum number of reminders shown",
        }, 
        useRelativeDueDate: {
          val: false,
          name: "Use relative dates",
          description: "Set to true for a relative due date (in 3 hours) instead of absolute (3:00 PM).",
          type: "bool",
        },
        showWithoutDueDate: {
          val: false,
          name: "Show reminders without a due date",
          type: "bool",
        },
        showOverdue: {
          val: false,
          name: "Show overdue reminders",
          type: "bool",
        },
        todayOnly: {
          val: false,
          name: "Hide reminders due after today",
          type: "bool",
        },
        selectLists: {
          val: "",
          name: "Lists to show",
          description: "Write the names of each list separated by commas, like this: Home,Work,Personal. Leave blank to show reminders from all lists.",
        }, 
        showListColor: {
          val: "rectangle left",
          name: "Display list color",
          description: "Choose the shape and location of the list color.",
          type: "enum",
          options: ["rectangle left","rectangle right","circle left","circle right","none"],
        }, 
        noRemindersBehavior: {
          val: "none",
          name: "Show when no reminders remain",
          description: "When no reminders remain, show a hard-coded message, a time-based greeting, or nothing.",
          type: "enum",
          options: ["message","greeting","none"],
        }, 
        url: {
          val: "",
          name: "URL to open when tapped",
          description: "Optionally provide a URL to open when this item is tapped. Leave blank to open the built-in Reminders app.",
        }, 
      },

      sunrise: {
        name: "Sunrise and sunset",
        showWithin: {
          val: "",
          name: "Limit times displayed",
          description: "Set how many minutes before/after sunrise or sunset to show this element. Leave blank to always show.",
        }, 
        separateElements: {
          val: false,
          name: "Use separate sunrise and sunset elements",
          description: "By default, the sunrise element changes between sunrise and sunset times automatically. Set to true for individual, hard-coded sunrise and sunset elements.",
          type: "bool",
        },
      },

      weather: {
        name: "Weather",
        showLocation: {
          val: false,
          name: "Show location name",
          type: "bool",
        },
        horizontalCondition: {
          val: false,
          name: "Display the condition and temperature horizontally",
          type: "bool",
        },
        showCondition: {
          val: false,
          name: "Show text value of the current condition",
          type: "bool",
        },
        showHighLow: {
          val: true,
          name: "Show today's high and low temperatures",
          type: "bool",
        },
        showRain: {
          val: false,
          name: "Show percent chance of rain",
          type: "bool",
        },
        tomorrowShownAtHour: {
          val: "20",
          name: "When to switch to tomorrow's weather",
          description: "Set the hour (in 24-hour time) to switch from the next hour to tomorrow's weather. Use 0 for always, 24 for never.",
        }, 
        spacing: {
          val: "0",
          name: "Spacing between daily or hourly forecast items",
        },
        horizontalHours: {
          val: false,
          name: "Display the hourly forecast horizontally",
          type: "bool",
        },
        showHours: {
          val: "3",
          name: "Number of hours shown in the hourly forecast item",
        }, 
        showHoursFormat: {
          val: "ha",
          name: "Date format for the hourly forecast item",
        }, 
        horizontalForecast: {
          val: false,
          name: "Display the daily forecast horizontally",
          type: "bool",
        },
        showDays: {
          val: "3",
          name: "Number of days shown in the daily forecast item",
        }, 
        showDaysFormat: {
          val: "E",
          name: "Date format for the daily forecast item",
        }, 
        showToday: {
          val: false,
          name: "Show today's weather in the daily forecast item",
          type: "bool",
        },
        urlCurrent: {
          val: "",
          name: "URL to open when current weather is tapped",
          description: "Optionally provide a URL to open when this item is tapped. Leave blank for the default.",
        }, 
        urlFuture: {
          val: "",
          name: "URL to open when hourly weather is tapped",
          description: "Optionally provide a URL to open when this item is tapped. Leave blank for the default.",
        }, 
        urlForecast: {
          val: "",
          name: "URL to open when daily weather is tapped",
          description: "Optionally provide a URL to open when this item is tapped. Leave blank for the default.",
        }, 
      },

      covid: {
        name: "COVID data",
        country: {
          val: "USA",
          name: "Country for COVID information",
        }, 
        url: {
          val: "https://covid19.who.int",
          name: "URL to open when the COVID data is tapped",
        }, 
      },
      
      symbol: {
        name: "Symbols",
        size: {
          val: "18",
          name: "Size",
          description: "Size of each symbol. Leave blank to fill the width of the column.",
        }, 
        padding: {
          val: { top: "", left: "", bottom: "", right: "" },
          name: "Padding",
          type: "multival",
          description: "The padding around each symbol. Leave blank to use the default padding.",
        },
        tintColor: {
          val: "ffffff",
          name: "Tint color",
          description: "The hex code color value to tint the symbols. Leave blank for the default tint.",
        }, 
      },
    }
    return settings
  },
}

/*
 * TESTING
 * Un-comment to test Weather Cal.
 * ===============================
 */

// const name = "Weather Cal widget"
// const iCloudInUse = true
// const codeFilename = "Weather Cal code"
// const gitHubUrl = "https://raw.githubusercontent.com/mzeryck/Weather-Cal/main/weather-cal-code.js"
// const layout = `
// row 
//   column
// 
// `
// await weatherCal.runSetup(name, iCloudInUse, codeFilename, gitHubUrl)
// 
// let w = await weatherCal.createWidget(layout, name, iCloudInUse)
// w.presentLarge()
// Script.complete()

/*
 * MODULE AND VERSION
 * Do not modify anything below this line.
 * =======================================
 */
module.exports = weatherCal
//4
