const debug = require('debug')('millegrilles:maitrecomptes:webauthn')
const multibase = require('multibase')
const base64url = require('base64url')
const { v4: uuidv4 } = require('uuid')
// const crypto = require('crypto')
// const base64url = require('base64url')
// const express = require('express')
const { Fido2Lib } = require("fido2-lib")
// const bodyParser = require('body-parser')

const CONST_CHALLENGE = 'challenge',
      CONST_AUTH_PRIMAIRE = 'authentificationPrimaire'

var _f2l = null
var _hostname = null

function init(hostname, idmg) {
  const options = {
    timeout: 60000,
    rpId: hostname,  // "mg-dev4.maple.maceroc.com",
    rpName: idmg,  // "MilleGrilles",
    // rpIcon: "https://example.com/logo.png",
    challengeSize: 128,
    attestation: "none",
    cryptoParams: [-7, -257],
    // authenticatorAttachment: "platform",
    // authenticatorAttachment: "cross-platform",
    authenticatorRequireResidentKey: false,
    authenticatorUserVerification: "preferred"
  }
  debug("Initialisation webauthn : %O", options)

  const f2l = new Fido2Lib(options)

  // Conserver instance
  _f2l = f2l
  _hostname = hostname
}

async function genererChallengeRegistration(req, res, next) {
  debug("genererChallengeRegistration: %O", req.body)
  var {userId, nomUsager} = req.session

  var userIdArray = null
  if(userId) {
    userIdArray = new Uint8Array(String.fromCharCode.apply(null, multibase.decode(userId)))
  } else {
    nomUsager = req.nomUsager || req.body.nomUsager
    // Generer userId random avec uuidv4
    userIdArray = new Uint8Array(16)
    uuidv4(null, userIdArray)
  }

  const registrationChallenge = await _genererRegistrationOptions(userIdArray, nomUsager)
  debug("Registration challenge : %O", registrationChallenge)

  req.session[CONST_CHALLENGE] = {
    challenge: registrationChallenge.challenge,
    userId: registrationChallenge.userId,
    nomUsager,
  }

  return res.send({
    challenge: registrationChallenge.attestation,
  })
}

async function genererChallenge(compteUsager) {
  const authnOptions = await _f2l.assertionOptions()

  const challenge = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(authnOptions.challenge)))

  const allowCredentials = compteUsager.webauthn.map(item=>{
    return {id: item.credId, type: item.type}
  })
  // const credId = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(_authnrDataEnregistre.get('credId'))))
  //
  // const allowCredentials = [
  //   {
  //     type: 'public-key',
  //     id: credId,
  //   }
  // ]

  const authnOptionsBuffer = {
    ...authnOptions,
    challenge,
    allowCredentials,
  }

  debug("Authentication options : %O", authnOptionsBuffer)

  return authnOptionsBuffer
}

async function authentifier(req, res, next) {

  debug("Authentifier U2F\nSession: %O\nBody: %O", req.session, req.body)

  try {
    const sessionAuthChallenge = req.session[CONST_CHALLENGE],
          infoCompteUsager = req.compteUsager.compteUsager,
          clientAssertionResponse = req.body.webauthn

    debug("authentifier: challenge : %O\ncompteUsager: %O\nauthResponse: %O", sessionAuthChallenge, infoCompteUsager, clientAssertionResponse)

    // Faire correspondre credId
    const credId64 = clientAssertionResponse.id64
    const credInfo = infoCompteUsager.webauthn.filter(item=>{
      return item.credId === credId64
    })[0]

    const userId = multibase.decode(infoCompteUsager.userId)
    const prevCounter = credInfo.counter

    debug("Cred info match: %O", credInfo)
    clientAssertionResponse.id = new Uint8Array(Buffer.from(base64url.decode(clientAssertionResponse.id))).buffer

    const clientResponse = clientAssertionResponse.response
    clientResponse.authenticatorData = multibase.decode(clientResponse.authenticatorData).buffer,
    clientResponse.clientDataJSON = multibase.decode(clientResponse.clientDataJSON).buffer,
    clientResponse.signature = multibase.decode(clientResponse.signature).buffer,
    clientResponse.userHandle = multibase.decode(clientResponse.userHandle).buffer

    const publicKey = credInfo.publicKeyPem
    const challengeBuffer = multibase.decode(sessionAuthChallenge)

    debug("Public Key : %O", publicKey)
    debug("Challenge : %O", challengeBuffer)

    var assertionExpectations = {
        challenge: challengeBuffer,
        origin: "https://" + _hostname,
        factor: "either",
        publicKey,
        userHandle: userId,
        prevCounter,
    }

    debug("Client assertion response : %O", clientAssertionResponse)
    debug("Assertion expectations : %O", assertionExpectations)

    var authnResult = await _f2l.assertionResult(clientAssertionResponse, assertionExpectations); // will throw on error
    debug("Authentification OK, resultat : %O", authnResult)

    _counter = authnResult.authnrData.get('counter') || 0

    delete req.session[CONST_CHALLENGE]

    req.session[CONST_AUTH_PRIMAIRE] = 'webauthn'
    req.session.webauthnCredId = credId64

    return next()

    // const autorise = await validateurAuthentification.verifierU2f(
    //   infoCompteUsager, sessionAuthChallenge, authResponse)
    //
    // if(autorise) {
    //
    //   // Set methode d'autenficiation primaire utilisee pour creer session
    //   req.session[CONST_AUTH_PRIMAIRE] = 'u2f'
    //
    //   // Conserver information des idmgs dans la session
    //   for(let cle in req.idmgsInfo) {
    //     req.session[cle] = req.idmgsInfo[cle]
    //   }

    // Rediriger vers URL, sinon liste applications de la Millegrille
    // return next()
  } catch(err) {
    console.error("Erreur authentification : %O", err)
    return refuserAcces(req, res, next)
  }
}

async function _genererRegistrationOptions(userId, nomUsager) {
  debug("Registration request, usager %s", nomUsager)
  const attestationParams = {
      relyingParty: { name: _hostname },
      user: { id: userId, name: nomUsager }
  }
  debug("Registration attestation params : %O", attestationParams)

  const attestationOptions = await _f2l.attestationOptions()
  debug("Registration options : %O", attestationOptions)

  const challenge = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(attestationOptions.challenge)))
  const userIdString = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(userId)))

  var attestationOptionsSerialized = {
    ...attestationOptions,
    user: {
      ...attestationOptions.user,
      id: userIdString,
    },
    challenge,
  }
  debug("Attestation opts serialized : %O", attestationOptionsSerialized)

  // const attestationExpectations = {
  //     challenge: attestationOptions.challenge,
  //     origin: `https://${_hostname}`,
  //     factor: "either"
  // }
  // debug("Attestation expectations : %O", attestationExpectations)

  return {
    userId: userIdString,
    nomUsager,
    challenge,  // Retourner challenger encode pour serialiser dans la session
    attestation: attestationOptionsSerialized,
    // expectations: attestationExpectations,
  }
}

async function verifierChallengeRegistration(req, res, next) {
  debug("prendrePossession: Body : %O\nSession %O", req.body, req.session)
  try {
    const { challenge, userId, nomUsager } = req.session[CONST_CHALLENGE]
    const response = req.body
    debug("Verification registration userId : %O, challenge : %O, reponse : %O", userId, challenge, response)

    const challengeArray = multibase.decode(challenge)

    const attestationExpectations = {
        challenge: challengeArray,
        origin: `https://${_hostname}`,
        factor: 'either'
    }
    debug("Attestation expectations : %O", attestationExpectations)

    const rawId = new Uint8Array(Buffer.from(base64url.decode(response.id))).buffer
    const clientAttestationResponse = {
      id: response.id,
      rawId,
      response: response.response,
    }
    debug("Client attestation response : %O", clientAttestationResponse)

    var regResult = await _f2l.attestationResult(clientAttestationResponse, attestationExpectations)
    debug("Registration result OK : %O", regResult)

    const authnrData = regResult.authnrData

    const credId = String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(authnrData.get('credId'))))
    const counter = authnrData.get('counter') || 0
    const publicKeyPem = authnrData.get('credentialPublicKeyPem')

    const informationCle = {
      userId,
      credId,
      nomUsager,
      counter,
      publicKeyPem,
      type: 'public-key',
    }

    delete req.session[CONST_CHALLENGE]
    req.informationCle = informationCle

    return next()
  } catch(err) {
    console.error("Echec verification registration : %O", err)
    return res.sendStatus(403)
  }

}

module.exports = {
  init,
  genererChallengeRegistration, verifierChallengeRegistration,
  genererChallenge, authentifier,
}
