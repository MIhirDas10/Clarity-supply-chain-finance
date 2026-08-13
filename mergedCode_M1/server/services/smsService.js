exports.sendStatusUpdateSMS = async (phoneNumber, status) => {
    if (!phoneNumber) return;
    console.log(`Sending SMS to ${phoneNumber}: Your invoice status has advanced to ${status}`);

};
